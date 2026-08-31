// Payment-history helpers for the Dashboard Payment History widget and the
// FailedBookingsBanner on the Booking page.
//
// Primary source : GET /payments via the svp-proxy (SVP
//                  /api/v1/individual_labor_space/payments list).
// Fallback       : if the list endpoint isn't deployed/available, extract the
//                  payment attempts embedded inside GET /exam-reservations
//                  (payments / payment_transactions / transactions arrays and
//                  latest_payment objects).

import { api } from "@/lib/api";

export type PaymentStatusType = "success" | "failed" | "pending" | "unknown";

export interface PaymentRecord {
  paymentId: string;
  reservationId: string;
  occupation: string;
  status: PaymentStatusType;
  rawStatus: string;
  amount: string;
  currency: string;
  method: string;
  createdAt: string;
  source: "payments-endpoint" | "reservation-embedded";
}

export interface PaymentSummary {
  total: number;
  success: number;
  failed: number;
  pending: number;
}

function pickArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.data, payload?.items, payload?.result, payload?.payload,
    payload?.payments, payload?.data?.payments, payload?.data?.items,
    payload?.exam_reservations, payload?.reservations,
    payload?.data?.exam_reservations, payload?.data?.reservations,
  ];
  for (const item of candidates) { if (Array.isArray(item)) return item; }
  return [];
}

function firstValue(obj: any, keys: string[]): any {
  for (const key of keys) {
    const v = obj?.[key];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
}

export function classifyPaymentStatus(raw: string): PaymentStatusType {
  const s = String(raw || "").toLowerCase();
  if (!s) return "unknown";
  if (/fail|declin|reject|cancel|expired|void|error|not\s*successful|unsuccessful/.test(s)) return "failed";
  // NOTE: pending is checked BEFORE success because "unpaid" contains the
  // substring "paid" and must not be classified as a successful payment.
  if (/pending|initiated|created|processing|unpaid|not_paid|payment_required|awaiting|in_progress/.test(s)) return "pending";
  if (/paid|success|successful|completed|confirmed|settled|captured/.test(s)) return "success";
  // HyperPay / Network International result-code classification:
  // 000.xxx (except 000.200.xxx which is pending) = paid.
  if (/^000\.\d+\.\d+/.test(s) && !/^000\.200\./.test(s)) return "success";
  if (/^000\.200\./.test(s)) return "pending";
  return "unknown";
}

export function normalizePayment(
  payment: any,
  context: { reservationId?: string; occupation?: string; source?: PaymentRecord["source"] } = {}
): PaymentRecord {
  const rawStatus = String(
    firstValue(payment, ["status", "state", "payment_status", "transaction_status", "result"]) || ""
  );
  const resultCode = String(
    firstValue(payment, [
      "result.code", "response.result.code", "payment.result.code",
      "payment_status.result.code", "status_code", "code",
    ]) || ""
  );
  // PHP logic: if no explicit result code, infer from rawStatus if it looks like a code
  const effectiveCode = (!resultCode && /^\d{3}\./.test(rawStatus)) ? rawStatus : resultCode;
  const classifyKey = effectiveCode || rawStatus;
  const amount = firstValue(payment, ["amount", "total", "total_amount", "price", "amount_cents"]);
  return {
    paymentId: String(firstValue(payment, ["id", "payment_id", "transaction_id", "checkout_id", "reference"]) || "-"),
    reservationId: String(
      context.reservationId ||
      firstValue(payment, ["payable_id", "reservation_id", "exam_reservation_id"]) ||
      payment?.payable?.id ||
      "-"
    ),
    occupation: String(
      context.occupation ||
      payment?.occupation?.english_name ||
      payment?.occupation?.name ||
      firstValue(payment, ["occupation_name"]) ||
      "-"
    ),
    status: classifyPaymentStatus(classifyKey),
    rawStatus: rawStatus || "unknown",
    amount: amount === "" ? "-" : String(amount),
    currency: String(firstValue(payment, ["currency", "currency_code"]) || "SAR"),
    method: String(firstValue(payment, ["payment_method", "method", "payment_type", "brand"]) || "-"),
    createdAt: String(
      firstValue(payment, ["created_at", "createdAt", "updated_at", "timestamp", "paid_at"]) || ""
    ),
    source: context.source || "payments-endpoint",
    result_code: effectiveCode || null,
  } as PaymentRecord;
}

function reservationOccupation(item: any): string {
  return String(
    item?.occupation?.english_name || item?.occupation?.name || item?.occupation_name || "-"
  );
}

function reservationId(item: any): string {
  return String(firstValue(item, ["id", "reservation_id", "exam_reservation_id"]) || "-");
}

/** Extracts every embedded payment attempt out of a reservations list. */
export function extractPaymentsFromReservations(reservations: any[]): PaymentRecord[] {
  const records: PaymentRecord[] = [];
  for (const item of reservations || []) {
    const ctx = {
      reservationId: reservationId(item),
      occupation: reservationOccupation(item),
      source: "reservation-embedded" as const,
    };
    const embedded = [
      ...(Array.isArray(item?.payments) ? item.payments : []),
      ...(Array.isArray(item?.payment_transactions) ? item.payment_transactions : []),
      ...(Array.isArray(item?.transactions) ? item.transactions : []),
      ...(item?.latest_payment ? [item.latest_payment] : []),
      ...(item?.payment ? [item.payment] : []),
    ];
    if (embedded.length) {
      embedded.forEach((p) => records.push(normalizePayment(p, ctx)));
      continue;
    }
    // No embedded payment objects — synthesize one from the reservation's own
    // payment status so failed/pending attempts still show up in history.
    const rawStatus = String(
      firstValue(item, ["payment_status", "paymentStatus", "pay_status", "paid_status"]) || ""
    );
    if (rawStatus) {
      records.push(
        normalizePayment(
          { status: rawStatus, created_at: firstValue(item, ["created_at", "updated_at"]) },
          ctx
        )
      );
    }
  }
  // De-duplicate by paymentId+reservationId (latest first by createdAt).
  const seen = new Set<string>();
  return records
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .filter((r) => {
      const key = `${r.paymentId}:${r.reservationId}:${r.rawStatus}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Loads the payment history. Tries the svp-proxy GET /payments list first;
 * automatically falls back to reservation-embedded payments when the list
 * endpoint is missing (404/older proxy deploy) or errors.
 */
export async function fetchPaymentHistory(): Promise<{ records: PaymentRecord[]; source: PaymentRecord["source"] }> {
  try {
    const data = await api("/payments?locale=en");
    const list = pickArray(data);
    if (list.length) {
      return { records: list.map((p) => normalizePayment(p)), source: "payments-endpoint" };
    }
  } catch {
    // fall through to the reservations fallback
  }
  const reservations = pickArray(await api("/exam-reservations?locale=en"));
  return { records: extractPaymentsFromReservations(reservations), source: "reservation-embedded" };
}

export function summarizePayments(records: PaymentRecord[]): PaymentSummary {
  return {
    total: records.length,
    success: records.filter((r) => r.status === "success").length,
    failed: records.filter((r) => r.status === "failed").length,
    pending: records.filter((r) => r.status === "pending").length,
  };
}

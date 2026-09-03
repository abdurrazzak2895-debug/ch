export type ReservationBillingOperation = "booking" | "reschedule";

// A reservation may be immutable/finalized without being refundable. In
// particular, completed and attended reservations represent a successful
// booking/exam and must never be credited back to the wallet.
const NON_REFUNDABLE_RESERVATION_STATUS_RE = /active|pending|reserved|hold|scheduled|booked|confirm|processing|paid|success|complete|attend/i;
const REFUNDABLE_RESERVATION_STATUS_RE = /cancel|expired|no[_\s-]?show|absent|void|fail|declin|reject|error|closed/i;

export function getReservationBillingOperation(
  method: string,
  path: string,
): ReservationBillingOperation | null {
  if (method !== "POST") return null;
  if (path === "/exam-reservations") return "booking";
  if (/^\/exam-reservations\/[^/]+\/reschedule$/.test(path)) return "reschedule";
  return null;
}

export function canFinalizeWalletDebit(
  operation: ReservationBillingOperation | null,
  reservationId: string | number | null | undefined,
): boolean {
  return operation !== null && String(reservationId ?? "").trim().length > 0;
}

export function isRefundEligibleReservation(
  status: string | null | undefined,
  cancellationTimestamp?: string | null,
): boolean {
  const normalizedStatus = String(status ?? "").toLowerCase().trim();

  // Status is authoritative when the upstream API supplies both a status and
  // a cancellation timestamp. This prevents stale/metadata timestamps from
  // refunding a reservation that is already completed or attended.
  if (normalizedStatus && NON_REFUNDABLE_RESERVATION_STATUS_RE.test(normalizedStatus)) return false;
  return Boolean(String(cancellationTimestamp ?? "").trim()) || REFUNDABLE_RESERVATION_STATUS_RE.test(normalizedStatus);
}

export function getReservationRefundIdempotencyKey(accountId: string, reservationId: string | number): string {
  return `refund:${accountId}:${String(reservationId).trim()}`;
}

export function isNonRefundableStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "").toLowerCase().trim();
  return /active|pending|reserved|hold|scheduled|booked|confirm|processing/.test(s);
}

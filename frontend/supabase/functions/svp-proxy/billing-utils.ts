export type ReservationBillingOperation = "booking" | "reschedule";

const FINALIZED_RESERVATION_STATUS_RE = /cancel|expired|attended|completed|no[_\s-]?show|absent|refunded|void|fail|declin|reject|error/i;

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
  return Boolean(String(cancellationTimestamp ?? "").trim()) || FINALIZED_RESERVATION_STATUS_RE.test(String(status ?? ""));
}

export function getReservationRefundIdempotencyKey(accountId: string, reservationId: string | number): string {
  return `refund:${accountId}:${String(reservationId).trim()}`;
}

export type ReservationBillingOperation = "booking" | "reschedule";

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

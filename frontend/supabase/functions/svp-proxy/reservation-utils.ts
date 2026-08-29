export function getReservationLookupId(path: string, query: string): string {
  const directMatch = path.match(/^\/exam-reservations\/([^/]+)$/);
  if (directMatch?.[1]) return decodeURIComponent(directMatch[1]).trim();

  const params = new URLSearchParams(query);
  for (const key of ["reservation_id", "id", "exam_reservation_id", "reservationId"]) {
    const value = params.get(key)?.trim();
    if (value) return value;
  }
  return "";
}

function getRecordId(record: any): string {
  const value =
    record?.id ??
    record?.reservation_id ??
    record?.exam_reservation_id ??
    record?.reservationId ??
    record?.exam_reservation?.id ??
    record?.reservation?.id;
  return value === undefined || value === null || value === "" ? "" : String(value);
}

function isReservationRecord(value: any): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      getRecordId(value) &&
      (value.reservation_status !== undefined ||
        value.status !== undefined ||
        value.exam_session_id !== undefined ||
        value.test_center_id !== undefined ||
        value.test_center !== undefined)
  );
}

export function extractReservationRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;

  const candidates = [
    payload?.exam_reservations,
    payload?.reservations,
    payload?.data?.exam_reservations,
    payload?.data?.reservations,
    payload?.items,
    payload?.results,
    payload?.data,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return isReservationRecord(payload) ? [payload] : [];
}

export function filterReservationRows(payload: any, reservationId: string): any[] {
  const target = String(reservationId || "").trim();
  if (!target) return extractReservationRows(payload);
  return extractReservationRows(payload).filter((row) => getRecordId(row) === target);
}

export function reshapeReservationPayload(payload: any, rows: any[]): any {
  if (Array.isArray(payload)) return rows;
  if (Array.isArray(payload?.exam_reservations)) return { ...payload, exam_reservations: rows };
  if (Array.isArray(payload?.reservations)) return { ...payload, reservations: rows };
  if (Array.isArray(payload?.data?.exam_reservations)) {
    return { ...payload, data: { ...payload.data, exam_reservations: rows } };
  }
  if (Array.isArray(payload?.data?.reservations)) {
    return { ...payload, data: { ...payload.data, reservations: rows } };
  }
  if (Array.isArray(payload?.items)) return { ...payload, items: rows };
  if (Array.isArray(payload?.results)) return { ...payload, results: rows };
  if (Array.isArray(payload?.data)) return { ...payload, data: rows };
  return rows[0] ?? null;
}

export function buildReservationCollectionQuery(query: string): string {
  const params = new URLSearchParams(query);
  for (const key of ["reservation_id", "id", "exam_reservation_id", "reservationId"]) {
    params.delete(key);
  }
  params.delete("page");
  params.set("per_page", params.get("per_page") || "10000");
  return params.toString();
}

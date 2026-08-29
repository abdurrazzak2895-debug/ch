import { describe, expect, it } from "vitest";
import {
  buildReservationCollectionQuery,
  filterReservationRows,
  getReservationLookupId,
  reshapeReservationPayload,
} from "../../supabase/functions/svp-proxy/reservation-utils";

describe("SVP reservation lookup filtering", () => {
  const oldReservation = {
    id: 3699715,
    reservation_status: "completed",
    test_center_id: 166,
  };
  const requestedReservation = {
    id: 5312907,
    reservation_status: "pending",
    test_center_id: 180,
  };

  it("extracts an ID from a collection query or direct route", () => {
    expect(getReservationLookupId("/exam-reservations", "reservation_id=5312907")).toBe("5312907");
    expect(getReservationLookupId("/exam-reservations/5312907", "")).toBe("5312907");
  });

  it("filters a wrapped collection to the requested reservation only", () => {
    const payload = { exam_reservations: [oldReservation, requestedReservation], page: 1 };
    const rows = filterReservationRows(payload, "5312907");
    expect(rows).toEqual([requestedReservation]);
    expect(rows).not.toContainEqual(oldReservation);
    expect(reshapeReservationPayload(payload, rows)).toEqual({
      exam_reservations: [requestedReservation],
      page: 1,
    });
  });

  it("returns no match instead of treating an unrelated record as the requested ID", () => {
    expect(filterReservationRows({ exam_reservations: [oldReservation] }, "5312907")).toEqual([]);
  });

  it("removes local ID filters before the upstream collection request", () => {
    const query = buildReservationCollectionQuery(
      "reservation_id=5312907&status=pending&page=2&per_page=25",
    );
    const params = new URLSearchParams(query);
    expect(params.get("reservation_id")).toBeNull();
    expect(params.get("page")).toBeNull();
    expect(params.get("per_page")).toBe("25");
    expect(params.get("status")).toBe("pending");
  });
});

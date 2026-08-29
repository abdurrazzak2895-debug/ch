import { describe, expect, it } from "vitest";
import { filterSessionsForCenter } from "@/lib/booking-utils";

describe("BookingPage center-scoped session filtering", () => {
  it("keeps only sessions for the selected real center", () => {
    const sessions = [
      { id: "session-403-a", test_center: { test_center_id: 403, test_center_name: "Arkan Al-Taameer" } },
      { id: "session-180-a", test_center: { test_center_id: 180, test_center_name: "Madaripur Technical Training Centre" } },
    ];

    expect(filterSessionsForCenter(sessions, "403")).toEqual([sessions[0]]);
  });

  it("supports the live SVP nested center shape", () => {
    const session = {
      id: "session-403-b",
      exam_session: {
        test_center: {
          test_center_id: 403,
          test_center_name: "Arkan Al-Taameer",
        },
      },
    };

    expect(filterSessionsForCenter([session], 403)).toEqual([session]);
  });

  it("does not show centerless sessions as if they belonged to the selected center", () => {
    const centerless = { id: "session-without-center", exam_date: "2026-08-18" };

    expect(filterSessionsForCenter([centerless], 403)).toEqual([]);
  });

  it("returns no sessions when no center is selected", () => {
    expect(filterSessionsForCenter([{ id: 1, site_id: 403 }], "")).toEqual([]);
  });
});

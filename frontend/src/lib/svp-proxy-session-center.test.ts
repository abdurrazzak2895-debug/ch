import { describe, expect, it } from "vitest";
import {
  countLiveSessionsForCenter,
  filterLiveSessionsForCenter,
  visibleCenterIds,
} from "../../supabase/functions/svp-proxy/session-center-utils";

describe("Live SVP centre filtering", () => {
  const payload = [
    { id: "live-17", site_id: "17", status: "scheduled", available_seats: 4 },
    { id: "wrong-403", site_id: "403", status: "scheduled", available_seats: 9 },
    { id: "unlabelled", status: "scheduled", available_seats: 9 },
    { id: "full-17", site_id: "17", status: "scheduled", available_seats: 0 },
  ];

  it("keeps only live sessions explicitly bound to the requested centre", () => {
    expect(filterLiveSessionsForCenter(payload, "17").map((item) => item.id)).toEqual(["live-17"]);
    expect(countLiveSessionsForCenter(payload, "403")).toBe(1);
  });

  it("does not make an unlabelled session visible for every centre", () => {
    expect(visibleCenterIds(payload)).toEqual(["17", "403"]);
    expect(countLiveSessionsForCenter(payload, "102")).toBe(0);
  });
});

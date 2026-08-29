import { describe, it, expect } from "vitest";
import {
  buildCenterOptions,
  filterCentersWithAvailableSessions,
  getSessionCenterName,
  getSessionSiteId,
  getCenterKey,
  VERIFIED_DHAKA_CENTER_ROSTER,
  mergeVerifiedCityCenterRoster,
  getResponseCenterIds,
  getResponseCenterName,
  resolveVerifiedResponseCenterId,
  isNoExamSession422,
} from "./booking-utils";

describe("booking-utils center name resolution", () => {
  // Shape A: flat fields (test_center_id + test_center_name at top-level)
  const sessionFlat = {
    id: 1001,
    test_center_id: 201,
    test_center_name: "Pabna Technical Training Centre",
    site_id: 23234234,
    site_city: "Rajshahi",
  };

  // Shape B: nested test_center object (test_center.id, test_center.name)
  const sessionNestedId = {
    id: 1002,
    test_center: {
      id: 305,
      name: "Dhaka Skills Center",
      city: "Dhaka",
    },
  };

  // Shape C: nested test_center with test_center_id + test_center_name (as in real API)
  const sessionNestedFull = {
    id: 1003,
    test_center: {
      test_center_id: 201,
      test_center_name: "Pabna Technical Training Centre",
      site_id: 23234234,
      test_center_city: "Rajshahi",
    },
  };

  // Shape D: only city + site_id (fallback synthesized name)
  const sessionFallback = {
    id: 1004,
    site_id: 999,
    site_city: "Chittagong",
  };

  it("resolves flat top-level test_center_name", () => {
    expect(getSessionCenterName(sessionFlat)).toBe("Pabna Technical Training Centre");
  });

  it("resolves nested test_center.name", () => {
    expect(getSessionCenterName(sessionNestedId)).toBe("Dhaka Skills Center");
  });

  it("resolves nested test_center.test_center_name", () => {
    expect(getSessionCenterName(sessionNestedFull)).toBe("Pabna Technical Training Centre");
  });

  it("synthesizes a fallback name from city + site_id when no name present", () => {
    const name = getSessionCenterName(sessionFallback);
    expect(name).toContain("Chittagong");
    expect(name).toContain("999");
  });

  it("extracts site id from nested test_center.id when no site_id present", () => {
    expect(getSessionSiteId(sessionNestedId)).toBe("305");
  });

  it("prefers top-level site_id when present", () => {
    expect(getSessionSiteId(sessionFlat)).toBe("23234234");
  });

  it("buildCenterOptions deduplicates across mixed shapes by center key", () => {
    const mixed = [sessionFlat, sessionNestedId, sessionNestedFull, sessionFallback];
    const options = buildCenterOptions(mixed);
    // sessionFlat and sessionNestedFull share site_id 23234234 -> deduped
    const keys = options.map((o) => o.siteId);
    expect(new Set(keys).size).toBe(keys.length);
    expect(options).toHaveLength(3);

    const names = options.map((o) => o.name);
    expect(names).toContain("Pabna Technical Training Centre");
    expect(names).toContain("Dhaka Skills Center");
    expect(names.some((n) => n.includes("Chittagong"))).toBe(true);
  });

  it("buildCenterOptions renders correct name+city for every center regardless of shape", () => {
    const mixed = [sessionFlat, sessionNestedId, sessionFallback];
    const options = buildCenterOptions(mixed);

    const byKey = Object.fromEntries(options.map((o) => [o.siteId, o]));
    expect(byKey[getCenterKey(sessionFlat)].name).toBe("Pabna Technical Training Centre");
    expect(byKey[getCenterKey(sessionFlat)].city).toBe("Rajshahi");
    expect(byKey[getCenterKey(sessionNestedId)].name).toBe("Dhaka Skills Center");
    expect(byKey[getCenterKey(sessionFallback)].city).toBe("Chittagong");
  });

  it("restricts Dhaka to the seven verified SVP centre IDs and backfills missing live rows", () => {
    const result = mergeVerifiedCityCenterRoster([
      { id: 403, name: "Arkan Al-Taameer for professional classification - Dhaka" },
      { id: 999, name: "Stale centre that must not appear" },
      { id: 45, name: "Bangladesh German TTC" },
    ], "Dhaka", 78);

    expect(result.map((item) => String(item.id ?? item.test_center_id))).toEqual(
      VERIFIED_DHAKA_CENTER_ROSTER.map((item) => item.siteId),
    );
    expect(result).toHaveLength(7);
    expect(result.map((item) => item.name)).toContain("Bangladesh Korea TTC Dhaka");
    expect(result.map((item) => item.name)).not.toContain("Stale centre that must not appear");
  });

  it("rejects a final response that names another centre", () => {
    const response = {
      exam_reservation: {
        exam_session: {
          test_center: {
            id: 45,
            test_center_id: 45,
            name: "Bangladesh German TTC",
            city: "Dhaka",
          },
        },
      },
    };

    expect(getResponseCenterIds(response)).toEqual(["45"]);
    expect(getResponseCenterName(response)).toBe("Bangladesh German TTC");
    expect(resolveVerifiedResponseCenterId(response, "115")).toBe("");
  });

  it("accepts a final response whose explicit centre matches the selected centre", () => {
    const response = {
      reservation: {
        exam_session: {
          test_center: {
            test_center_id: 115,
            test_center_name: "BRTC Central Training Institute Gazipur",
            city: "Dhaka",
          },
        },
      },
    };

    expect(resolveVerifiedResponseCenterId(response, 115)).toBe("115");
  });

  it("does not alter non-Dhaka centre rosters", () => {
    const centres = [{ id: 180, name: "Madaripur Technical Training Centre", city: "Barishal" }];
    expect(mergeVerifiedCityCenterRoster(centres, "Barishal", 78)).toEqual(centres);
  });

  it("removes centres with no sessions for the selected date", () => {
    const centres = [
      { siteId: "180", name: "Madaripur Technical Training Centre", city: "Barishal", sessionCount: 0 },
      { siteId: "240", name: "Patuakhali Technical Training Centre", city: "Barishal", sessionCount: 2 },
      { siteId: "166", name: "Faridpur Technical Training Centre", city: "Barishal", sessionCount: null },
    ];

    expect(filterCentersWithAvailableSessions(centres).map((item) => item.siteId)).toEqual(["240", "166"]);
  });

  it("allows an empty result when every centre has zero sessions", () => {
    expect(filterCentersWithAvailableSessions([
      { siteId: "180", sessionCount: 0 },
      { siteId: "240", sessionCount: 0 },
    ])).toEqual([]);
  });

  it("classifies SVP no-exam-session 422 details as stale-session errors", () => {
    expect(isNoExamSession422({
      status: 422,
      message: "SVP request failed: 422",
      data: { details: { message: "test center selected no exam session" } },
    })).toBe(true);
    expect(isNoExamSession422({
      status: 422,
      message: "Booking validation failed",
      data: { details: { message: "another centre returned" } },
    })).toBe(false);
    expect(isNoExamSession422({
      status: 409,
      message: "test center selected no exam session",
    })).toBe(false);
  });
});

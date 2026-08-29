import { describe, expect, it } from "vitest";
import { resolveVerifiedSessionCenterId } from "./booking-utils";

describe("resolveVerifiedSessionCenterId", () => {
  const expectedSessionId = "mw9jlSaduA--7eppqv4F7W7-KX8O--p8a8SOPArCgqg3IEqn9Cvg";

  it("uses the selected centre-scoped session when detail has only city-level identity", () => {
    const verified = resolveVerifiedSessionCenterId({
      detail: {
        id: "-BrD6Scl-g--9k79QXUjJsgJ3VDu--eO7t6oClVDYTJ9HHRA_s1w",
        test_center: { city: "Dhaka", country_id: 78 },
      },
      selectedSession: {
        id: expectedSessionId,
        site_id: "223",
        test_center_id: "223",
      },
      expectedSessionId,
      expectedCenterId: "223",
    });

    expect(verified).toBe("223");
  });

  it("accepts an explicit detail centre ID when it matches", () => {
    const verified = resolveVerifiedSessionCenterId({
      detail: {
        id: expectedSessionId,
        site_id: "223",
        test_center: { test_center_id: "223" },
      },
      selectedSession: { id: expectedSessionId, site_id: "223" },
      expectedSessionId,
      expectedCenterId: "223",
    });

    expect(verified).toBe("223");
  });

  it("rejects an explicit conflicting detail centre even if the list row is stale", () => {
    const verified = resolveVerifiedSessionCenterId({
      detail: {
        id: expectedSessionId,
        site_id: "180",
        test_center: { test_center_id: "180" },
      },
      selectedSession: { id: expectedSessionId, site_id: "223" },
      expectedSessionId,
      expectedCenterId: "223",
    });

    expect(verified).toBe("");
  });

  it("rejects a city-only detail response when the selected list row is not the same session", () => {
    const verified = resolveVerifiedSessionCenterId({
      detail: { id: "different-session", test_center: { city: "Dhaka" } },
      selectedSession: { id: "another-session", site_id: "223" },
      expectedSessionId,
      expectedCenterId: "223",
    });

    expect(verified).toBe("");
  });
});

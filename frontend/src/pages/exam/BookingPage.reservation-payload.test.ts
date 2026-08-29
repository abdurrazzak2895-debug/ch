// Regression test for the BookingPage exam_reservations POST body.
//
// BUG: the booking POST used to send `site_id` and `site_city` derived from
// the current UI selection. SVP treats those as an OVERRIDE — when our
// values were stale, admin-mapped fallbacks (e.g. site_id=1) or simply
// out of sync with the true center bound to the selected exam_session,
// SVP would confirm the booking in a DIFFERENT centre within the same
// city than the one the user picked.
//
// FIX: mirror the official SVP frontend (svp-international.pacc.sa)
// behaviour — ALWAYS send `site_id: null`, `site_city: null`, and
// `hold_id: null` so SVP derives the centre purely from
// `exam_session_id`. (Captured directly from a network trace of the
// real SVP UI's last booking confirm step.)
//
// This test snapshots the expected payload shape produced by the
// current BookingPage.tsx new-booking path.

import { describe, it, expect } from "vitest";
import { buildExamReservationPayload, getSessionPayloadId } from "@/lib/booking-utils";

// The production builder below is also exercised directly in a regression
// case; the legacy mirror remains for documenting the expected contract.
function buildReservationBody(args: {
  sessionId: string | number;
  selectedOccupationId: string | number;
  methodology: string;
  effectiveLanguageCode: string;
  // intentionally ignored — kept here so the test documents the contract.
  siteId?: string | number | null;
  siteCity?: string | null;
  selectedCity?: string | null;
  holdId?: string | number | null;
}) {
  return {
    exam_session_id: getSessionPayloadId(args.sessionId),
    occupation_id: Number(args.selectedOccupationId),
    methodology: args.methodology || "in_person",
    language_code: args.effectiveLanguageCode,
    site_id: null,
    site_city: null,
    hold_id: null,
  };
}

function buildRescheduleBody(args: {
  oldReservationId: string | number;
  sessionId: string | number;
  languageCode: string;
}) {
  return {
    id: Number(args.oldReservationId),
    exam_session_id: getSessionPayloadId(args.sessionId),
    language_code: args.languageCode,
  };
}

// Mirror of the old buggy body construction.
function buildReservationBody_BUGGY(args: {
  sessionId: string | number;
  selectedOccupationId: string | number;
  methodology: string;
  effectiveLanguageCode: string;
  siteId: string | number | null;
  siteCity: string | null;
  selectedCity: string | null;
  holdId: string | number | null;
}) {
  return {
    exam_session_id: Number(args.sessionId),
    occupation_id: Number(args.selectedOccupationId),
    methodology: args.methodology || "in_person",
    language_code: args.effectiveLanguageCode,
    site_id: args.siteId ? Number(args.siteId) : null,
    site_city: args.siteCity || args.selectedCity || null,
    hold_id: args.holdId ? Number(args.holdId) : null,
  };
}

describe("BookingPage exam_reservations POST — SVP-frontend-parity payload", () => {
  it("nulls out site_id, site_city and hold_id even when the UI has them populated", () => {
    const body = buildReservationBody({
      sessionId: 1490206,
      selectedOccupationId: 2145,
      methodology: "in_person",
      effectiveLanguageCode: "TDEE2",
      siteId: 1,
      siteCity: "Dhaka",
      selectedCity: "Dhaka",
      holdId: 3693063,
    });
    expect(body).toEqual({
      exam_session_id: 1490206,
      occupation_id: 2145,
      methodology: "in_person",
      language_code: "TDEE2",
      site_id: null,
      site_city: null,
      hold_id: null,
    });
  });

  it("matches the SVP frontend confirm-step payload byte-for-byte", () => {
    // Captured from a real network trace of svp-international.pacc.sa
    // (exam_session_id 1554447, occupation 2061, Rajshahi center).
    const body = buildReservationBody({
      sessionId: 1554447,
      selectedOccupationId: 2061,
      methodology: "in_person",
      effectiveLanguageCode: "LOABB",
      siteId: null,
      siteCity: null,
      selectedCity: "Rajshahi",
      holdId: null,
    });
    expect(body).toEqual({
      exam_session_id: 1554447,
      occupation_id: 2061,
      language_code: "LOABB",
      methodology: "in_person",
      site_id: null,
      site_city: null,
      hold_id: null,
    });
  });

  it("preserves encrypted live SVP exam-session ids", () => {
    const encrypted = "fpCB8ZqACQ==--HWu2pq9m6P4MditA--xzo2UpARXVF5o8Xs2UVNFQ==";
    const body = buildReservationBody({
      sessionId: encrypted,
      selectedOccupationId: 2061,
      methodology: "in_person",
      effectiveLanguageCode: "LOABB",
    });

    expect(body.exam_session_id).toBe(encrypted);
    expect(body.site_id).toBeNull();
    expect(body.site_city).toBeNull();
    expect(body.hold_id).toBeNull();
  });

  it("preserves encrypted live SVP exam-session ids for reschedule", () => {
    const encrypted = "57pDq4THw==--Id8y92OLe+oKN9bs--pOVyIUUgdY3gD6b66pEliQ==";
    const body = buildRescheduleBody({
      oldReservationId: 987654,
      sessionId: encrypted,
      languageCode: "LOANN",
    });

    expect(body).toEqual({
      id: 987654,
      exam_session_id: encrypted,
      language_code: "LOANN",
    });
  });

  it("uses the production builder to preserve the selected encrypted session and clear center overrides", () => {
    const encrypted = "L-iQDqXgIA---sS9xLf-Zor-lAFV--NtHYoNAduM7E8CLkoTMALQ";
    const body = buildExamReservationPayload({
      examSessionId: getSessionPayloadId(encrypted),
      occupationId: 2061,
      methodology: "in_person",
      languageCode: "LOABB",
    });
    expect(body).toEqual({
      exam_session_id: encrypted,
      occupation_id: 2061,
      methodology: "in_person",
      language_code: "LOABB",
      site_id: null,
      site_city: null,
      hold_id: null,
    });
  });

  it("documents the old buggy payload that caused wrong-center bookings", () => {
    const buggy = buildReservationBody_BUGGY({
      sessionId: 1490206,
      selectedOccupationId: 2145,
      methodology: "in_person",
      effectiveLanguageCode: "TDEE2",
      siteId: 1,
      siteCity: "Dhaka",
      selectedCity: "Dhaka",
      holdId: 3693063,
    });
    // The old payload forwarded the stale UI siteId/holdId, which SVP would
    // then use to override the test center chosen on the exam_session.
    expect(buggy).toEqual({
      exam_session_id: 1490206,
      occupation_id: 2145,
      methodology: "in_person",
      language_code: "TDEE2",
      site_id: 1,
      site_city: "Dhaka",
      hold_id: 3693063,
    });
    // After the fix we never reach that shape again.
    const fixed = buildReservationBody({
      sessionId: 1490206,
      selectedOccupationId: 2145,
      methodology: "in_person",
      effectiveLanguageCode: "TDEE2",
      siteId: 1,
      siteCity: "Dhaka",
      selectedCity: "Dhaka",
      holdId: 3693063,
    });
    expect(fixed.site_id).toBeNull();
    expect(fixed.site_city).toBeNull();
    expect(fixed.hold_id).toBeNull();
  });
});

# Amar SVP Booking Centre Data-Path Report

**Author:** Manus AI
**Date:** 15 August 2026
**Repository:** `abdurrazzak2895-debug/amar` (`main`)
**Production:** [amar-three.vercel.app](https://amar-three.vercel.app)
**Supabase project:** `xklwzkraobxetxdcysun`

## Executive conclusion

The Amar booking UI **does not populate its test-centre dropdown from `public.test_centers`**. The primary source is the live SVP test-centre API, accessed through the deployed `svp-proxy` Edge Function. The frontend calls `/test-centers`, and the proxy forwards that request to SVP’s `/api/v1/visitor_space/test_centers` endpoint before normalizing the response.[1] [2]

The imported 30-centre CSV data in `public.test_centers` is therefore valuable for **fallback name and site-ID resolution**, but it does not, by itself, add or remove centres from the booking dropdown. The booking dropdown and date-specific availability remain governed by live SVP responses.[1] [3]

> **Answer to the active investigation:** `public.test_centers` is a fallback/enrichment source, not the authoritative centre-list source for the booking UI.

## Verified data flow

| Booking stage | Current Amar source | Verification result |
|---|---|---|
| Occupation and category | Amar frontend configuration and SVP-backed flow | Working in the tested live flow. |
| City selection | Amar booking page | Working; tested with Dhaka and Barishal scenarios. |
| Centre dropdown | Live `/test-centers` through `svp-proxy` → SVP `/visitor_space/test_centers` | **Not read from `public.test_centers`.**[1] [2] |
| Date-specific centre availability | Live `/exam-sessions` request for every returned centre, with `exam_date`, `test_center_id`, and positive-seat filtering | Implemented to remove centres with no sessions on the selected date.[1] |
| Session list | Live `/exam-sessions` with the exact selected `test_center_id` | Centre-scoped and filtered again in the frontend to prevent cross-centre sessions.[1] |
| Session-centre verification | Centre-scoped selected list row plus strict detail-response guard | Prevents wrong-centre holds while tolerating SVP detail responses that omit a site ID.[4] |
| Temporary hold | Live SVP temporary-seat request with the selected centre/session IDs | Successfully tested at sites 218 and 220. |
| Final reservation | Explicitly confirmed live booking action | Successfully created reservations while preserving the selected centre; no payment credentials or OTP were entered. |

## Where `public.test_centers` is used

The database table is still used in controlled fallback paths. The booking page queries it to resolve names for configured section-centre rules, to map session payloads with a known `site_id`, to resolve a city only when that city has exactly one configured centre, and to reverse-resolve a centre name to a site ID when SVP omits the numeric ID.[3]

The city-only fallback is deliberately disabled for multi-centre cities. This is important because a city such as Dhaka or Barishal can contain multiple real SVP centres; guessing from city alone could display or book the wrong centre. The live SVP centre-scoped session response remains the authoritative identity source for the booking guard.[3] [4]

## Live verification evidence

The deployed production bundle contains the live `/test-centers` route and the separate `test_centers` fallback queries, confirming that the deployed frontend follows the same source separation as the repository.[5]

The live centre-specific flow was verified after the guard fix. A Narsingdi booking used site 218 and successfully created hold `#5160332` before reservation `#5313783`. A Kishoreganj booking used site 220 and successfully created hold `#5160630` before reservation `#5314083`; a second date, 23 August 2026, preserved site 220, displayed only site-220 sessions, created hold `#5160942`, and produced reservation `#5314342`. The recorded live results show that changing the date does not replace the selected real centre with another centre, and that the session list remains centre-specific.[6]

The direct unauthenticated production probe returned HTTP 401 `Missing access token`. This is expected for the protected proxy route and does not contradict the source-code conclusion; the browser-authenticated booking session is the appropriate way to inspect live centre payloads.[6]

## Current implementation status

The core requirements are implemented and pushed to `main`:

| Requirement | Status |
|---|---|
| Preserve selected centre across date changes | Implemented and live-tested. |
| Show only sessions for the selected real centre | Implemented through exact `test_center_id` requests and frontend filtering. |
| Prevent wrong-centre booking | Implemented through the strict selected-session centre guard. |
| Handle SVP detail responses with city-only centre data | Implemented with a same-session, same-centre fallback; explicit conflicting IDs remain rejected. |
| Use Prometric language code | Booking flow uses `LOABB` for Bengali, not ISO `bn`. |
| Filter reservation lookup by requested ID | Implemented server-side in `svp-proxy`. |
| Add supplied SVP centre CSV | Completed: 30 imported rows; 31 total database rows including the pre-existing row. |
| Push changes to GitHub `main` | Completed at commit `03f6283`.[7] |
| Deploy `svp-proxy` | Completed directly to Supabase in the inherited session. |

## Remaining actions

### 1. GitHub Actions secrets

Automatic Supabase deployment is not yet healthy. The latest visible `supabase-deploy.yml` run failed, and the sandbox could not read the repository secret list because GitHub returned HTTP 403.[8] Add these repository secrets at [Amar Actions secrets](https://github.com/abdurrazzak2895-debug/amar/settings/secrets/actions), using a newly generated Supabase access token:

| Secret | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | A newly generated token from the Supabase account-token page; do not reuse any token previously pasted into chat. |
| `SUPABASE_PROJECT_ID` | `xklwzkraobxetxdcysun` |

After adding them, manually rerun the failed workflow and confirm that the deployment completes successfully.

### 2. Credential hygiene

The previously shared Supabase and GitHub credentials should remain revoked and must not be reused. The inherited context records that the user already revoked them; no credential values are reproduced in this report.

### 3. Optional database-authoritative mode

No code change is required for the current live-SVP design. If the business requirement is instead that the Amar dropdown show exactly the centres stored in `public.test_centers`, the `/test-centers` proxy route would need to query that table, or merge it with the live SVP list. That change should be made cautiously: the database must contain correct SVP `site_id` values, and every displayed centre must still be checked against live centre-scoped sessions before holding a seat. Keeping SVP as the primary source is safer for current availability because it avoids stale database rows.

### 4. Unpaid reservations

Reservations `#5313783`, `#5314083`, and `#5314342` have payment pages but no payment credentials or OTP were entered by the agent. Payment completion remains a user-controlled action.

## Final recommendation

Keep the current architecture: **live SVP for centre discovery, date availability, sessions, holds, and reservations; `public.test_centers` for controlled enrichment and fallback resolution**. This preserves accurate availability while retaining the imported centre registry as a safety net for incomplete SVP payloads. Replacing live discovery with the database would make the dropdown easier to control, but it would also introduce stale-centre and stale-availability risk unless the live per-centre session checks remain mandatory.

## References

[1]: https://github.com/abdurrazzak2895-debug/amar/blob/main/frontend/src/pages/exam/BookingPage.tsx#L682-L798 "Amar BookingPage live centre, date availability, and session-loading code"

[2]: https://github.com/abdurrazzak2895-debug/amar/blob/main/frontend/supabase/functions/svp-proxy/index.ts#L651-L665 "Amar svp-proxy test-centres upstream route"

[3]: https://github.com/abdurrazzak2895-debug/amar/blob/main/frontend/src/pages/exam/BookingPage.tsx#L800-L958 "Amar public.test_centers fallback and enrichment code"

[4]: https://github.com/abdurrazzak2895-debug/amar/blob/main/frontend/src/lib/booking-utils.ts#L98-L144 "Amar strict session-centre verification helper"

[5]: https://amar-three.vercel.app/assets/index-Cy4eosiH.js "Deployed Amar production JavaScript bundle"

[6]: https://amar-three.vercel.app/exam/booking "Amar production booking page used for live verification"

[7]: https://github.com/abdurrazzak2895-debug/amar/commit/03f6283 "Amar commit 03f6283: verify session centre from selected live session"

[8]: https://github.com/abdurrazzak2895-debug/amar/actions/runs/31889106765 "Latest visible failed Supabase deployment workflow run"

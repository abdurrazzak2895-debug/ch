import { describe, expect, it } from "vitest";
import {
  canFinalizeWalletDebit,
  getReservationBillingOperation,
} from "../../supabase/functions/svp-proxy/billing-utils";

describe("SVP proxy reservation wallet billing", () => {
  it("charges successful new reservations", () => {
    expect(getReservationBillingOperation("POST", "/exam-reservations")).toBe("booking");
  });

  it("charges successful reservation reschedules", () => {
    expect(
      getReservationBillingOperation("POST", "/exam-reservations/123/reschedule"),
    ).toBe("reschedule");
  });

  it("does not charge reservation reads, cancellation, or preparation", () => {
    expect(getReservationBillingOperation("GET", "/exam-reservations")).toBeNull();
    expect(getReservationBillingOperation("DELETE", "/exam-reservations/123")).toBeNull();
    expect(getReservationBillingOperation("POST", "/temporary-seats")).toBeNull();
    expect(getReservationBillingOperation("POST", "/reservation-credits/use")).toBeNull();
  });

  it("finalizes a wallet debit only with a real reservation ID", () => {
    expect(canFinalizeWalletDebit("booking", "5312907")).toBe(true);
    expect(canFinalizeWalletDebit("reschedule", 5312907)).toBe(true);
    expect(canFinalizeWalletDebit("booking", "")).toBe(false);
    expect(canFinalizeWalletDebit("booking", null)).toBe(false);
    expect(canFinalizeWalletDebit(null, "svp-success:request-id")).toBe(false);
  });
});

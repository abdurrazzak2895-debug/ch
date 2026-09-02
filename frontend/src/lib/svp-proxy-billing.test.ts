import { describe, expect, it } from "vitest";
import {
  canFinalizeWalletDebit,
  getReservationBillingOperation,
  getReservationRefundIdempotencyKey,
  isRefundEligibleReservation,
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

  it("treats failed, cancelled, and expired outcomes as refundable", () => {
    expect(isRefundEligibleReservation("failed")).toBe(true);
    expect(isRefundEligibleReservation("declined")).toBe(true);
    expect(isRefundEligibleReservation("cancelled")).toBe(true);
    expect(isRefundEligibleReservation("expired")).toBe(true);
    expect(isRefundEligibleReservation("active")).toBe(false);
    expect(isRefundEligibleReservation("paid")).toBe(false);
    expect(isRefundEligibleReservation("", "2026-09-01T10:00:00Z")).toBe(true);
  });

  it("uses one stable refund key for every retry of the same account and reservation", () => {
    const first = getReservationRefundIdempotencyKey("acct-42", "5312907");
    const retry = getReservationRefundIdempotencyKey("acct-42", 5312907);
    const otherAccount = getReservationRefundIdempotencyKey("acct-99", "5312907");
    expect(first).toBe("refund:acct-42:5312907");
    expect(retry).toBe(first);
    expect(otherAccount).not.toBe(first);
  });
});

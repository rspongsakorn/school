import { describe, expect, it } from "vitest";
import { pickFeeAmount } from "./pick-fee-amount";

const tiered = {
  hasReimbursableVariant: true,
  amount: 5000,
  amountReimbursable: 7000,
  amountPrivate: 6000,
};

describe("pickFeeAmount", () => {
  it("returns the standard amount for the standard tier", () => {
    expect(pickFeeAmount({ ...tiered, tier: "standard" })).toEqual({
      amount: 5000,
      variant: "standard",
    });
  });

  it("returns the reimbursable amount for the reimbursable tier", () => {
    expect(pickFeeAmount({ ...tiered, tier: "reimbursable" })).toEqual({
      amount: 7000,
      variant: "reimbursable",
    });
  });

  it("returns the private amount for the private tier", () => {
    expect(pickFeeAmount({ ...tiered, tier: "private" })).toEqual({
      amount: 6000,
      variant: "private",
    });
  });

  it("falls back to standard when amountReimbursable is null", () => {
    expect(
      pickFeeAmount({ ...tiered, tier: "reimbursable", amountReimbursable: null }),
    ).toEqual({ amount: 5000, variant: "standard" });
  });

  it("falls back to standard — not reimbursable — when amountPrivate is null", () => {
    expect(pickFeeAmount({ ...tiered, tier: "private", amountPrivate: null })).toEqual({
      amount: 5000,
      variant: "standard",
    });
  });

  it("returns standard when the item has no tiered pricing", () => {
    expect(
      pickFeeAmount({ ...tiered, tier: "private", hasReimbursableVariant: false }),
    ).toEqual({ amount: 5000, variant: "standard" });
    expect(
      pickFeeAmount({ ...tiered, tier: "reimbursable", hasReimbursableVariant: false }),
    ).toEqual({ amount: 5000, variant: "standard" });
  });
});

import { describe, expect, it } from "vitest";
import { pickFeeAmount } from "./pick-fee-amount";

describe("pickFeeAmount", () => {
  it("returns standard amount when invoice is not reimbursable", () => {
    expect(
      pickFeeAmount({
        isReimbursable: false,
        hasReimbursableVariant: true,
        amount: 5000,
        amountReimbursable: 7000,
      }),
    ).toEqual({ amount: 5000, variant: "standard" });
  });

  it("returns reimbursable amount when invoice + item + price all set", () => {
    expect(
      pickFeeAmount({
        isReimbursable: true,
        hasReimbursableVariant: true,
        amount: 5000,
        amountReimbursable: 7000,
      }),
    ).toEqual({ amount: 7000, variant: "reimbursable" });
  });

  it("falls back to standard when amountReimbursable is null", () => {
    expect(
      pickFeeAmount({
        isReimbursable: true,
        hasReimbursableVariant: true,
        amount: 5000,
        amountReimbursable: null,
      }),
    ).toEqual({ amount: 5000, variant: "standard" });
  });

  it("returns standard when item does not have reimbursable variant", () => {
    expect(
      pickFeeAmount({
        isReimbursable: true,
        hasReimbursableVariant: false,
        amount: 5000,
        amountReimbursable: 7000,
      }),
    ).toEqual({ amount: 5000, variant: "standard" });
  });
});

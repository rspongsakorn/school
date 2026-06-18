import { describe, expect, it } from "vitest";
import {
  resolveLineDiscount,
  resolvePaymentDiscounts,
  type DiscountInput,
} from "./payment-discount";

describe("resolveLineDiscount", () => {
  it("resolves a fixed discount to its baht value", () => {
    expect(resolveLineDiscount(8000, "fixed", 500)).toBe(500);
  });

  it("resolves a percent discount against the line amount", () => {
    expect(resolveLineDiscount(8000, "percent", 10)).toBe(800);
  });

  it("rounds percent results to 2 decimals", () => {
    expect(resolveLineDiscount(333.33, "percent", 10)).toBe(33.33);
  });
});

describe("resolvePaymentDiscounts", () => {
  const lines = [
    { id: "l1", feeItemId: "f1", amount: 8000 },
    { id: "l2", feeItemId: "f2", amount: 2000 },
    { id: "l3", feeItemId: "f3", amount: 1500 },
  ];

  it("computes net due and resolved rows for valid input", () => {
    const input: DiscountInput[] = [
      { invoiceLineId: "l1", discountType: "fixed", discountValue: 500 },
    ];
    const result = resolvePaymentDiscounts(11500, lines, input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalDiscount).toBe(500);
    expect(result.netDue).toBe(11000);
    expect(result.rows).toEqual([
      { invoiceLineId: "l1", feeItemId: "f1", discountType: "fixed", discountValue: 500, amount: 500 },
    ]);
  });

  it("supports discounting multiple lines at once", () => {
    const input: DiscountInput[] = [
      { invoiceLineId: "l1", discountType: "percent", discountValue: 10 },
      { invoiceLineId: "l2", discountType: "fixed", discountValue: 200 },
    ];
    const result = resolvePaymentDiscounts(11500, lines, input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalDiscount).toBe(1000); // 800 + 200
    expect(result.netDue).toBe(10500);
  });

  it("rejects a discount larger than the line amount", () => {
    const input: DiscountInput[] = [
      { invoiceLineId: "l2", discountType: "fixed", discountValue: 5000 },
    ];
    const result = resolvePaymentDiscounts(11500, lines, input);
    expect(result.ok).toBe(false);
  });

  it("rejects a percent outside 0..100", () => {
    const input: DiscountInput[] = [
      { invoiceLineId: "l1", discountType: "percent", discountValue: 150 },
    ];
    expect(resolvePaymentDiscounts(11500, lines, input).ok).toBe(false);
  });

  it("rejects a discount for a line not on the invoice", () => {
    const input: DiscountInput[] = [
      { invoiceLineId: "nope", discountType: "fixed", discountValue: 100 },
    ];
    expect(resolvePaymentDiscounts(11500, lines, input).ok).toBe(false);
  });

  it("rejects a net due of zero (cannot discount 100%)", () => {
    const input: DiscountInput[] = [
      { invoiceLineId: "l1", discountType: "fixed", discountValue: 8000 },
      { invoiceLineId: "l2", discountType: "fixed", discountValue: 2000 },
      { invoiceLineId: "l3", discountType: "fixed", discountValue: 1500 },
    ];
    expect(resolvePaymentDiscounts(11500, lines, input).ok).toBe(false);
  });
});

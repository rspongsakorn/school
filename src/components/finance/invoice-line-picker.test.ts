import { describe, expect, it } from "vitest";
import { draftDiscountAmount, pickerTotal } from "@/components/finance/invoice-line-picker";
import { resolveLineDiscount } from "@/lib/finance/payment-discount";

describe("draftDiscountAmount", () => {
  it("rounds a percent discount the same way the server does", () => {
    expect(draftDiscountAmount(875, { value: "14.5", unit: "percent" })).toBe(
      resolveLineDiscount(875, "percent", 14.5),
    );
  });

  it("caps a discount at the line amount", () => {
    expect(draftDiscountAmount(500, { value: "800", unit: "fixed" })).toBe(500);
  });
});

describe("pickerTotal", () => {
  it("sums only ticked, owed lines after their discounts", () => {
    const lines = [
      { id: "A", description: "a", amount: 875, isPaid: false },
      { id: "B", description: "b", amount: 500, isPaid: false },
      { id: "C", description: "c", amount: 300, isPaid: true },
    ];
    expect(
      pickerTotal(lines, new Set(["A", "C"]), { A: { value: "14.5", unit: "percent" } }),
    ).toBe(Math.round((875 - resolveLineDiscount(875, "percent", 14.5)) * 100) / 100);
  });
});

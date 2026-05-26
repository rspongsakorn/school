import { describe, expect, it } from "vitest";
import {
  feeItemCanDelete,
  feeItemDeleteBlockedReason,
} from "@/lib/finance/fee-item-delete-eligibility";

function ctx(
  overrides: Partial<{ feeRates: number | null; invoiceLines: number | null }> = {},
) {
  return { feeRates: 0, invoiceLines: 0, ...overrides };
}

describe("feeItemCanDelete", () => {
  it("allows delete when no references", () => {
    expect(feeItemCanDelete(ctx())).toBe(true);
  });

  it("blocks delete when referenced by fee_rates", () => {
    expect(feeItemCanDelete(ctx({ feeRates: 1 }))).toBe(false);
  });

  it("blocks delete when referenced by invoice_lines", () => {
    expect(feeItemCanDelete(ctx({ invoiceLines: 1 }))).toBe(false);
  });

  it("blocks delete when referenced by both", () => {
    expect(feeItemCanDelete(ctx({ feeRates: 2, invoiceLines: 3 }))).toBe(false);
  });

  it("treats null counts as zero", () => {
    expect(feeItemCanDelete(ctx({ feeRates: null, invoiceLines: null }))).toBe(true);
  });
});

describe("feeItemDeleteBlockedReason", () => {
  it("returns null when deletable", () => {
    expect(feeItemDeleteBlockedReason(ctx())).toBeNull();
  });

  it("returns fee_rates reason when only fee_rates block", () => {
    expect(feeItemDeleteBlockedReason(ctx({ feeRates: 1 }))).toBe(
      "มีอัตราค่าธรรมเนียมอ้างถึง",
    );
  });

  it("returns invoice_lines reason when only invoice_lines block", () => {
    expect(feeItemDeleteBlockedReason(ctx({ invoiceLines: 1 }))).toBe("มีใบแจ้งชำระอ้างถึง");
  });

  it("returns combined reason when both block", () => {
    expect(feeItemDeleteBlockedReason(ctx({ feeRates: 1, invoiceLines: 1 }))).toBe(
      "มีอัตราค่าธรรมเนียมและใบแจ้งชำระอ้างถึง",
    );
  });
});

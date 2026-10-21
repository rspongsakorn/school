import { describe, expect, it } from "vitest";
import {
  INSURANCE_WAIVER_DEFAULT_REASON,
  canWaiveInsuranceInvoice,
  insuranceWaiverBlockedReason,
} from "@/lib/finance/insurance-waiver";

function ctx(
  overrides: Partial<{
    paidAmount: number;
    discountValue: number;
    lineNames: string[];
    alreadyWaived: boolean;
  }> = {},
) {
  return {
    paidAmount: 0,
    discountValue: 0,
    lineNames: ["ค่าประกันอุบัติเหตุ"],
    alreadyWaived: false,
    ...overrides,
  };
}

describe("canWaiveInsuranceInvoice", () => {
  it("allows an unpaid invoice whose only line is the insurance fee", () => {
    expect(canWaiveInsuranceInvoice(ctx())).toBe(true);
  });

  it("refuses an invoice that carries any other fee, even with insurance on it", () => {
    expect(
      canWaiveInsuranceInvoice(ctx({ lineNames: ["ค่าประกันอุบัติเหตุ", "ค่าอาหารกลางวัน"] })),
    ).toBe(false);
  });

  it("refuses an invoice with no insurance line", () => {
    expect(canWaiveInsuranceInvoice(ctx({ lineNames: ["ค่าอาหารกลางวัน"] }))).toBe(false);
  });

  it("refuses an invoice with no lines", () => {
    expect(canWaiveInsuranceInvoice(ctx({ lineNames: [] }))).toBe(false);
  });

  it("refuses once any money has been collected", () => {
    expect(canWaiveInsuranceInvoice(ctx({ paidAmount: 50 }))).toBe(false);
  });

  it("refuses an invoice that already has a discount", () => {
    expect(canWaiveInsuranceInvoice(ctx({ discountValue: 50 }))).toBe(false);
  });

  it("refuses an invoice that was already waived", () => {
    expect(canWaiveInsuranceInvoice(ctx({ alreadyWaived: true }))).toBe(false);
  });
});

describe("insuranceWaiverBlockedReason", () => {
  it("is null when the waiver is allowed", () => {
    expect(insuranceWaiverBlockedReason(ctx())).toBeNull();
  });

  it("explains each way it can be blocked", () => {
    expect(insuranceWaiverBlockedReason(ctx({ alreadyWaived: true }))).toBe(
      "ใบแจ้งนี้ถูกยกเว้นไปแล้ว",
    );
    expect(insuranceWaiverBlockedReason(ctx({ paidAmount: 50 }))).toBe(
      "ใบแจ้งนี้มีการชำระเงินแล้ว",
    );
    expect(insuranceWaiverBlockedReason(ctx({ discountValue: 50 }))).toBe(
      "ใบแจ้งนี้มีส่วนลดอยู่แล้ว",
    );
    expect(insuranceWaiverBlockedReason(ctx({ lineNames: ["ค่าอาหารกลางวัน"] }))).toBe(
      "ยกเว้นทั้งใบได้เฉพาะใบที่มีแต่ค่าประกัน",
    );
  });
});

it("has a default reason that names the promotion", () => {
  expect(INSURANCE_WAIVER_DEFAULT_REASON).toContain("31 พ.ค.");
});

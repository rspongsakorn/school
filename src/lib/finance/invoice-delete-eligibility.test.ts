import { describe, expect, it } from "vitest";
import {
  canDeleteInvoice,
  invoiceDeleteBlockedReason,
} from "@/lib/finance/invoice-delete-eligibility";

function ctx(
  overrides: Partial<{
    paidAmount: number;
    totalAmount: number;
    hasActivePaymentAllocation: boolean;
  }> = {},
) {
  return {
    paidAmount: 0,
    totalAmount: 100,
    hasActivePaymentAllocation: false,
    ...overrides,
  };
}

describe("canDeleteInvoice", () => {
  it("allows delete when nothing paid and no active allocation", () => {
    expect(canDeleteInvoice(ctx())).toBe(true);
  });

  it("allows delete after void when paid amount is zero", () => {
    expect(canDeleteInvoice(ctx({ paidAmount: 0, hasActivePaymentAllocation: false }))).toBe(
      true,
    );
  });

  it("blocks delete when active payment allocation exists", () => {
    expect(canDeleteInvoice(ctx({ hasActivePaymentAllocation: true }))).toBe(false);
  });

  it("blocks delete when partially paid", () => {
    expect(canDeleteInvoice(ctx({ paidAmount: 1 }))).toBe(false);
    expect(canDeleteInvoice(ctx({ paidAmount: 0.01 }))).toBe(false);
  });
});

describe("invoiceDeleteBlockedReason", () => {
  it("returns null when deletable", () => {
    expect(invoiceDeleteBlockedReason(ctx())).toBeNull();
  });

  it("returns void receipts message for active allocation", () => {
    expect(invoiceDeleteBlockedReason(ctx({ hasActivePaymentAllocation: true }))).toBe(
      "ยกเลิกใบเสร็จที่เกี่ยวข้องทั้งหมดก่อน",
    );
  });

  it("returns void all message for partial paid", () => {
    expect(invoiceDeleteBlockedReason(ctx({ paidAmount: 50 }))).toBe(
      "ต้องยกเลิกใบเสร็จทั้งหมดก่อน",
    );
  });
});

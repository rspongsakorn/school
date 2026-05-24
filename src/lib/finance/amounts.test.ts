import { describe, expect, it } from "vitest";
import {
  allocatePaymentFifo,
  computeInvoiceTotal,
  deriveInvoiceStatus,
} from "./amounts";

describe("computeInvoiceTotal", () => {
  it("applies percent discount", () => {
    expect(computeInvoiceTotal(10000, "percent", 10)).toBe(9000);
  });

  it("applies fixed discount", () => {
    expect(computeInvoiceTotal(10000, "fixed", 1500)).toBe(8500);
  });

  it("no discount returns subtotal", () => {
    expect(computeInvoiceTotal(5000, null, null)).toBe(5000);
  });
});

describe("deriveInvoiceStatus", () => {
  it("returns unpaid when paid is 0", () => {
    expect(deriveInvoiceStatus(0, 5000)).toBe("unpaid");
  });

  it("returns partial", () => {
    expect(deriveInvoiceStatus(2000, 5000)).toBe("partial");
  });

  it("returns paid when paid >= total", () => {
    expect(deriveInvoiceStatus(5000, 5000)).toBe("paid");
  });
});

describe("allocatePaymentFifo", () => {
  it("allocates oldest invoice first", () => {
    const invoices = [
      { id: "a", createdAt: "2026-01-02", outstanding: 3000 },
      { id: "b", createdAt: "2026-01-01", outstanding: 2000 },
    ];
    expect(allocatePaymentFifo(2500, invoices)).toEqual([
      { invoiceId: "b", amount: 2000 },
      { invoiceId: "a", amount: 500 },
    ]);
  });
});

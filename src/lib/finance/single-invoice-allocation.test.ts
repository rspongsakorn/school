import { describe, expect, it } from "vitest";
import { resolveSingleInvoicePayment } from "./single-invoice-allocation";

describe("resolveSingleInvoicePayment", () => {
  it("returns the requested amount when within outstanding", () => {
    expect(resolveSingleInvoicePayment({ amount: 500, outstanding: 1000 })).toEqual({
      ok: true,
      amount: 500,
    });
  });

  it("allows paying the full outstanding", () => {
    expect(resolveSingleInvoicePayment({ amount: 1000, outstanding: 1000 })).toEqual({
      ok: true,
      amount: 1000,
    });
  });

  it("rejects zero or negative amounts", () => {
    expect(resolveSingleInvoicePayment({ amount: 0, outstanding: 1000 }).ok).toBe(false);
    expect(resolveSingleInvoicePayment({ amount: -5, outstanding: 1000 }).ok).toBe(false);
  });

  it("rejects amounts exceeding outstanding", () => {
    expect(resolveSingleInvoicePayment({ amount: 1200, outstanding: 1000 }).ok).toBe(false);
  });

  it("rejects when nothing is outstanding", () => {
    expect(resolveSingleInvoicePayment({ amount: 100, outstanding: 0 }).ok).toBe(false);
  });
});

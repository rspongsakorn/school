import { describe, it, expect } from "vitest";
import { latestPaidAtByInvoice } from "./last-paid";

describe("latestPaidAtByInvoice", () => {
  it("returns the max paid_at per invoice_id", () => {
    const rows = [
      { invoiceId: "inv-1", paidAt: "2026-05-01T03:00:00.000Z", status: "active" as const },
      { invoiceId: "inv-1", paidAt: "2026-06-01T03:00:00.000Z", status: "active" as const },
      { invoiceId: "inv-2", paidAt: "2026-04-15T03:00:00.000Z", status: "active" as const },
    ];

    const result = latestPaidAtByInvoice(rows);

    expect(result.get("inv-1")).toBe("2026-06-01T03:00:00.000Z");
    expect(result.get("inv-2")).toBe("2026-04-15T03:00:00.000Z");
  });

  it("ignores voided payments", () => {
    const rows = [
      { invoiceId: "inv-1", paidAt: "2026-06-01T03:00:00.000Z", status: "voided" as const },
    ];

    const result = latestPaidAtByInvoice(rows);

    expect(result.has("inv-1")).toBe(false);
  });

  it("returns an empty map for no rows", () => {
    expect(latestPaidAtByInvoice([]).size).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { aggregateOutstandingByStudent } from "./per-student";
import type { OutstandingReportRow } from "@/lib/queries/reports";

function row(overrides: Partial<OutstandingReportRow> = {}): OutstandingReportRow {
  return {
    invoiceId: "inv-1",
    studentId: "stu-1",
    studentCode: "13705",
    studentName: "กานต์ธิดา ทุงทุกรี้",
    gradeClassroom: "ป.1/1",
    subtotal: 4600,
    totalAmount: 4600,
    paidAmount: 0,
    outstanding: 4600,
    status: "unpaid",
    priceTier: "standard",
    invoiceTypeName: "ค่าเทอม",
    issuedAt: "2026-07-17T03:00:00.000Z",
    lastPaidAt: null,
    discountType: null,
    discountValue: null,
    ...overrides,
  };
}

describe("aggregateOutstandingByStudent", () => {
  it("collapses every invoice of a student into one row with summed amounts", () => {
    const result = aggregateOutstandingByStudent([
      row({ invoiceId: "inv-1", subtotal: 4600, totalAmount: 4600, paidAmount: 4600, outstanding: 0, status: "paid" }),
      row({ invoiceId: "inv-2", subtotal: 200, totalAmount: 200, paidAmount: 0, outstanding: 200 }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      studentId: "stu-1",
      invoiceCount: 2,
      subtotal: 4800,
      totalAmount: 4800,
      paidAmount: 4600,
      outstanding: 200,
    });
  });

  it("derives the combined status from the totals", () => {
    const paid = aggregateOutstandingByStudent([
      row({ invoiceId: "a", paidAmount: 4600, outstanding: 0, status: "paid" }),
    ]);
    expect(paid[0].status).toBe("paid");

    const partial = aggregateOutstandingByStudent([
      row({ invoiceId: "a", paidAmount: 4600, outstanding: 0, status: "paid" }),
      row({ invoiceId: "b", totalAmount: 200, paidAmount: 0, outstanding: 200 }),
    ]);
    expect(partial[0].status).toBe("partial");

    const unpaid = aggregateOutstandingByStudent([row({ invoiceId: "a" }), row({ invoiceId: "b" })]);
    expect(unpaid[0].status).toBe("unpaid");
  });

  it("reports the discount as the baht difference between subtotal and total", () => {
    const result = aggregateOutstandingByStudent([
      row({ invoiceId: "a", subtotal: 4600, totalAmount: 4400, discountType: "fixed", discountValue: 200 }),
      row({ invoiceId: "b", subtotal: 200, totalAmount: 0, discountType: "percent", discountValue: 100 }),
    ]);

    expect(result[0].discountAmount).toBe(400);
  });

  it("keeps the latest payment date across invoices", () => {
    const result = aggregateOutstandingByStudent([
      row({ invoiceId: "a", lastPaidAt: "2026-05-05T03:00:00.000Z" }),
      row({ invoiceId: "b", lastPaidAt: "2026-06-05T03:00:00.000Z" }),
      row({ invoiceId: "c", lastPaidAt: null }),
    ]);

    expect(result[0].lastPaidAt).toBe("2026-06-05T03:00:00.000Z");
  });

  it("keeps a non-standard price tier so the badge still shows", () => {
    const result = aggregateOutstandingByStudent([
      row({ invoiceId: "a", priceTier: "standard" }),
      row({ invoiceId: "b", priceTier: "reimbursable" }),
    ]);

    expect(result[0].priceTier).toBe("reimbursable");
  });

  it("sorts students by student code", () => {
    const result = aggregateOutstandingByStudent([
      row({ studentId: "s2", studentCode: "13810" }),
      row({ studentId: "s1", studentCode: "13705" }),
    ]);

    expect(result.map((r) => r.studentCode)).toEqual(["13705", "13810"]);
  });
});

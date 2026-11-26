import { describe, it, expect } from "vitest";
import {
  OUTSTANDING_STATUS_ITEMS,
  outstandingStatusQuery,
  owedInvoices,
  parseOutstandingStatus,
  perStudentRowsFor,
} from "./outstanding-status";
import type { OutstandingReportRow } from "@/lib/queries/reports";

describe("parseOutstandingStatus", () => {
  it("defaults to outstanding when the param is missing", () => {
    expect(parseOutstandingStatus(null)).toBe("outstanding");
  });

  it("keeps old single-status bookmarks", () => {
    expect(parseOutstandingStatus("unpaid")).toBe("unpaid");
    expect(parseOutstandingStatus("partial")).toBe("partial");
    expect(parseOutstandingStatus("paid")).toBe("paid");
  });

  it("reads all explicitly", () => {
    expect(parseOutstandingStatus("all")).toBe("all");
  });

  it("falls back to outstanding on an unknown value", () => {
    expect(parseOutstandingStatus("bogus")).toBe("outstanding");
  });
});

describe("outstandingStatusQuery", () => {
  it("maps each filter to the query's arguments", () => {
    expect(outstandingStatusQuery("outstanding")).toEqual({ status: "all", includeAllStatuses: false });
    expect(outstandingStatusQuery("all")).toEqual({ status: "all", includeAllStatuses: true });
    expect(outstandingStatusQuery("unpaid")).toEqual({ status: "unpaid", includeAllStatuses: true });
    expect(outstandingStatusQuery("partial")).toEqual({ status: "partial", includeAllStatuses: true });
    expect(outstandingStatusQuery("paid")).toEqual({ status: "paid", includeAllStatuses: true });
  });
});

describe("OUTSTANDING_STATUS_ITEMS", () => {
  it("lists the options in the agreed order and wording", () => {
    expect(OUTSTANDING_STATUS_ITEMS.map((i) => i.value)).toEqual([
      "outstanding",
      "unpaid",
      "partial",
      "paid",
      "all",
    ]);
    expect(OUTSTANDING_STATUS_ITEMS.map((i) => i.label)).toEqual([
      "ยังค้างชำระ",
      "ยังไม่ชำระ",
      "ชำระบางส่วน",
      "ชำระแล้ว",
      "ทุกสถานะ",
    ]);
  });
});

function inv(overrides: Partial<OutstandingReportRow> = {}): OutstandingReportRow {
  return {
    invoiceId: "inv-1",
    studentId: "stu-1",
    studentCode: "100",
    studentName: "ทดสอบ",
    gradeClassroom: "ป.1/1",
    subtotal: 200,
    totalAmount: 200,
    paidAmount: 0,
    outstanding: 200,
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

describe("per-student view under the default filter", () => {
  it("fetches every status so a student is judged on all their invoices", () => {
    expect(outstandingStatusQuery("outstanding", "perStudent")).toEqual({
      status: "all",
      includeAllStatuses: true,
    });
    expect(outstandingStatusQuery("unpaid", "perStudent")).toEqual({
      status: "unpaid",
      includeAllStatuses: true,
    });
  });

  it("keeps a part-paid student whole and drops students who owe nothing", () => {
    const rows = [
      inv({ invoiceId: "a", subtotal: 4600, totalAmount: 4600, paidAmount: 4600, outstanding: 0, status: "paid" }),
      inv({ invoiceId: "b" }),
      inv({ invoiceId: "c", studentId: "stu-2", studentCode: "200", paidAmount: 200, outstanding: 0, status: "paid" }),
    ];
    const result = perStudentRowsFor(rows, "outstanding");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ studentId: "stu-1", totalAmount: 4800, paidAmount: 4600, outstanding: 200, status: "partial" });
    expect(perStudentRowsFor(rows, "all")).toHaveLength(2);
  });
});

describe("owedInvoices", () => {
  it("drops zero-balance invoices stored as unpaid under the default filter only", () => {
    const rows = [inv({ invoiceId: "a" }), inv({ invoiceId: "z", subtotal: 0, totalAmount: 0, outstanding: 0 })];
    expect(owedInvoices(rows, "outstanding").map((r) => r.invoiceId)).toEqual(["a"]);
    expect(owedInvoices(rows, "unpaid")).toHaveLength(2);
  });
});

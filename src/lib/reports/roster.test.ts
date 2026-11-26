import { describe, it, expect } from "vitest";
import { buildStudentRoster } from "./roster";
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

const paid = (o: Partial<OutstandingReportRow> = {}) =>
  row({ subtotal: 4600, totalAmount: 4600, paidAmount: 4600, outstanding: 0, status: "paid", ...o });
const unpaid200 = (o: Partial<OutstandingReportRow> = {}) =>
  row({ subtotal: 200, totalAmount: 200, paidAmount: 0, outstanding: 200, status: "unpaid", ...o });
const zero = (o: Partial<OutstandingReportRow> = {}) =>
  row({ subtotal: 0, totalAmount: 0, paidAmount: 0, outstanding: 0, status: "paid", ...o });

describe("buildStudentRoster", () => {
  it("collapses a student's invoices into one row", () => {
    const result = buildStudentRoster(
      [
        row({ invoiceId: "a", subtotal: 2900, totalAmount: 2900, paidAmount: 2900, outstanding: 0, status: "paid" }),
        zero({ invoiceId: "b" }),
      ],
      {},
    );

    expect(result).toEqual([
      {
        studentId: "stu-1",
        studentCode: "13705",
        studentName: "กานต์ธิดา ทุงทุกรี้",
        gradeClassroom: "ป.1/1",
        totalAmount: 2900,
        paidAmount: 2900,
        outstanding: 0,
        status: "paid",
      },
    ]);
  });

  it("filters on the student's combined status, after collapsing", () => {
    const rows = [
      paid({ invoiceId: "a", studentId: "stu-1", studentCode: "100" }),
      unpaid200({ invoiceId: "b", studentId: "stu-1", studentCode: "100" }),
      unpaid200({ invoiceId: "c", studentId: "stu-2", studentCode: "200" }),
    ];

    const partial = buildStudentRoster(rows, { status: "partial" });
    expect(partial.map((r) => r.studentId)).toEqual(["stu-1"]);
    expect(partial[0]).toMatchObject({ totalAmount: 4800, paidAmount: 4600, outstanding: 200 });

    expect(buildStudentRoster(rows, { status: "unpaid" }).map((r) => r.studentId)).toEqual(["stu-2"]);
    expect(buildStudentRoster(rows, { status: "paid" })).toEqual([]);
    expect(buildStudentRoster(rows, { status: "all" })).toHaveLength(2);
  });

  it("a student whose only invoice is zero reads as paid", () => {
    expect(buildStudentRoster([zero()], {})[0].status).toBe("paid");
  });

  it("searches name or code, case-insensitive, combined with status", () => {
    const rows = [
      paid({ studentId: "stu-1", studentCode: "13705", studentName: "กานต์ธิดา ทุงทุกรี้" }),
      unpaid200({ studentId: "stu-2", studentCode: "14297", studentName: "Somchai ใจดี" }),
    ];

    expect(buildStudentRoster(rows, { query: " 13705 " }).map((r) => r.studentId)).toEqual(["stu-1"]);
    expect(buildStudentRoster(rows, { query: "ทุงทุก" }).map((r) => r.studentId)).toEqual(["stu-1"]);
    expect(buildStudentRoster(rows, { query: "SOMCHAI" }).map((r) => r.studentId)).toEqual(["stu-2"]);
    expect(buildStudentRoster(rows, { query: "13705", status: "unpaid" })).toEqual([]);
  });

  it("sorts by student code numerically", () => {
    const result = buildStudentRoster(
      [
        unpaid200({ studentId: "stu-a", studentCode: "12400" }),
        unpaid200({ studentId: "stu-b", studentCode: "9999" }),
      ],
      {},
    );
    expect(result.map((r) => r.studentCode)).toEqual(["9999", "12400"]);
  });
});

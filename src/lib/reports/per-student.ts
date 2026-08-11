import type { PriceTier } from "@/lib/finance/price-tier";
import type { OutstandingReportRow } from "@/lib/queries/reports";

/**
 * One student's invoices collapsed into a single line — the shape the
 * "รวมรายคน" view of the outstanding report prints.
 */
export type PerStudentOutstandingRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  priceTier: PriceTier;
  invoiceCount: number;
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  /** Discount in baht, derived from the totals so fixed and percent mix cleanly. */
  discountAmount: number;
  status: "unpaid" | "partial" | "paid";
  lastPaidAt: string | null;
};

export function aggregateOutstandingByStudent(
  rows: OutstandingReportRow[],
): PerStudentOutstandingRow[] {
  const byStudent = new Map<string, PerStudentOutstandingRow>();

  for (const row of rows) {
    const current = byStudent.get(row.studentId);
    if (!current) {
      byStudent.set(row.studentId, {
        studentId: row.studentId,
        studentCode: row.studentCode,
        studentName: row.studentName,
        gradeClassroom: row.gradeClassroom,
        priceTier: row.priceTier,
        invoiceCount: 1,
        subtotal: row.subtotal,
        totalAmount: row.totalAmount,
        paidAmount: row.paidAmount,
        outstanding: row.outstanding,
        discountAmount: row.subtotal - row.totalAmount,
        status: "unpaid",
        lastPaidAt: row.lastPaidAt,
      });
      continue;
    }

    current.invoiceCount += 1;
    current.subtotal += row.subtotal;
    current.totalAmount += row.totalAmount;
    current.paidAmount += row.paidAmount;
    current.outstanding += row.outstanding;
    current.discountAmount += row.subtotal - row.totalAmount;
    if (row.priceTier !== "standard") current.priceTier = row.priceTier;
    if (row.lastPaidAt && (!current.lastPaidAt || row.lastPaidAt > current.lastPaidAt)) {
      current.lastPaidAt = row.lastPaidAt;
    }
  }

  const result = [...byStudent.values()];
  for (const student of result) {
    student.status =
      student.outstanding <= 0 ? "paid" : student.paidAmount > 0 ? "partial" : "unpaid";
  }

  return result.sort((a, b) =>
    a.studentCode.localeCompare(b.studentCode, "th", { numeric: true }),
  );
}

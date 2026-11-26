import type { OutstandingReportRow, StudentRosterRow } from "@/lib/queries/reports";
import { aggregateOutstandingByStudent } from "./per-student";

/**
 * The per-student report: one line per student, never one per invoice.
 *
 * The status filter is applied to the student's combined status, after the
 * invoices are collapsed. Filtering invoices first would show a student who
 * owes on one invoice and has paid another as "ค้างชำระ" with only that one
 * invoice's amounts — the student's position, misreported.
 */
export function buildStudentRoster(
  rows: OutstandingReportRow[],
  opts: { status?: "unpaid" | "partial" | "paid" | "all"; query?: string },
): StudentRosterRow[] {
  const students = aggregateOutstandingByStudent(rows);

  const byStatus =
    opts.status && opts.status !== "all"
      ? students.filter((s) => s.status === opts.status)
      : students;

  const q = opts.query?.trim().toLowerCase();
  const matched = q
    ? byStatus.filter(
        (s) => s.studentName.toLowerCase().includes(q) || s.studentCode.toLowerCase().includes(q),
      )
    : byStatus;

  return matched.map((s) => ({
    studentId: s.studentId,
    studentCode: s.studentCode,
    studentName: s.studentName,
    gradeClassroom: s.gradeClassroom,
    totalAmount: s.totalAmount,
    paidAmount: s.paidAmount,
    outstanding: s.outstanding,
    status: s.status,
  }));
}

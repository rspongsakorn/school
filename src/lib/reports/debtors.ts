export type EnrollmentStatus = "enrolled" | "transferred" | "withdrawn";

export type DebtorEnrollment = {
  studentId: string;
  status: EnrollmentStatus;
  /** "ปวช.2/1" — the room of that term */
  roomLabel: string;
  /** "1/2569" — semester number over academic year name */
  termLabel: string;
  /** Sortable term key ("<year start_date>#<semester number>"). */
  sortKey: string;
};

export type DebtorEnrollmentSummary = {
  roomLabel: string;
  status: EnrollmentStatus;
  firstTermLabel: string;
};

/**
 * Reduces a student's whole enrollment history to the two facts the debtor
 * report prints: the room they are in now — or the last room they were in,
 * for someone who has left, which is where their debt keeps being listed —
 * and the term they first entered.
 */
export function summarizeEnrollments(
  rows: DebtorEnrollment[],
): Map<string, DebtorEnrollmentSummary> {
  const latest = new Map<string, DebtorEnrollment>();
  const earliest = new Map<string, DebtorEnrollment>();

  for (const row of rows) {
    const currentLatest = latest.get(row.studentId);
    if (!currentLatest || row.sortKey > currentLatest.sortKey) {
      latest.set(row.studentId, row);
    }
    const currentEarliest = earliest.get(row.studentId);
    if (!currentEarliest || row.sortKey < currentEarliest.sortKey) {
      earliest.set(row.studentId, row);
    }
  }

  const result = new Map<string, DebtorEnrollmentSummary>();
  for (const [studentId, row] of latest) {
    result.set(studentId, {
      roomLabel: row.roomLabel,
      status: row.status,
      firstTermLabel: earliest.get(studentId)?.termLabel ?? row.termLabel,
    });
  }
  return result;
}

export type DebtorInvoice = {
  studentId: string;
  totalAmount: number;
  paidAmount: number;
};

export type DebtorStudent = {
  studentId: string;
  studentCode: string;
  studentName: string;
};

export type DebtorRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  roomLabel: string;
  status: EnrollmentStatus;
  firstTermLabel: string;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * One line per student, summing every invoice they hold across all academic
 * years — the whole point of this report, as opposed to the per-semester
 * outstanding report.
 */
export function buildDebtorRows(input: {
  students: DebtorStudent[];
  enrollments: Map<string, DebtorEnrollmentSummary>;
  invoices: DebtorInvoice[];
}): DebtorRow[] {
  const totals = new Map<string, { totalAmount: number; paidAmount: number }>();
  for (const invoice of input.invoices) {
    const current = totals.get(invoice.studentId) ?? { totalAmount: 0, paidAmount: 0 };
    current.totalAmount += invoice.totalAmount;
    current.paidAmount += invoice.paidAmount;
    totals.set(invoice.studentId, current);
  }

  return input.students
    .map((student) => {
      const total = totals.get(student.studentId) ?? { totalAmount: 0, paidAmount: 0 };
      const enrollment = input.enrollments.get(student.studentId);
      const totalAmount = round2(total.totalAmount);
      const paidAmount = round2(total.paidAmount);
      return {
        studentId: student.studentId,
        studentCode: student.studentCode,
        studentName: student.studentName,
        roomLabel: enrollment?.roomLabel ?? "—",
        status: enrollment?.status ?? ("enrolled" as EnrollmentStatus),
        firstTermLabel: enrollment?.firstTermLabel ?? "—",
        totalAmount,
        paidAmount,
        outstanding: Math.max(0, round2(totalAmount - paidAmount)),
      };
    })
    .sort((a, b) => a.studentCode.localeCompare(b.studentCode, "th", { numeric: true }));
}

export type DebtorTotals = { totalAmount: number; paidAmount: number; outstanding: number };

/**
 * The report's three footer rows: still enrolled, already gone, and the sum of
 * both — a student who left still owes what they owe.
 */
export function splitDebtorTotals(
  rows: Array<Pick<DebtorRow, "status" | "totalAmount" | "paidAmount" | "outstanding">>,
): { enrolled: DebtorTotals; departed: DebtorTotals; all: DebtorTotals } {
  const empty = (): DebtorTotals => ({ totalAmount: 0, paidAmount: 0, outstanding: 0 });
  const enrolled = empty();
  const departed = empty();
  const all = empty();

  for (const row of rows) {
    const bucket = row.status === "enrolled" ? enrolled : departed;
    for (const target of [bucket, all]) {
      target.totalAmount = round2(target.totalAmount + row.totalAmount);
      target.paidAmount = round2(target.paidAmount + row.paidAmount);
      target.outstanding = round2(target.outstanding + row.outstanding);
    }
  }

  return { enrolled, departed, all };
}

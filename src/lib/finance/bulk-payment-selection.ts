export type BulkPaymentCandidate = {
  id: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  invoiceName: string;
  outstanding: number;
};

export type BulkPaymentSkipped = {
  id: string;
  studentName: string;
  reason: string;
};

export type BulkPaymentTargets = {
  payable: BulkPaymentCandidate[];
  skipped: BulkPaymentSkipped[];
};

/**
 * Splits the ticked rows into the ones a batch payment can charge in full and
 * the ones it must leave alone. Table order is preserved because receipt
 * numbers are issued in the order the rows are submitted.
 */
export function resolveBulkPaymentTargets(
  rows: BulkPaymentCandidate[],
  selectedIds: Set<string>,
): BulkPaymentTargets {
  const payable: BulkPaymentCandidate[] = [];
  const skipped: BulkPaymentSkipped[] = [];

  for (const row of rows) {
    if (!selectedIds.has(row.id)) continue;
    if (row.outstanding > 0) {
      payable.push(row);
    } else {
      skipped.push({
        id: row.id,
        studentName: row.studentName,
        reason: "ไม่มียอดค้างชำระ",
      });
    }
  }

  return { payable, skipped };
}

export function summarizeTargets(payable: BulkPaymentCandidate[]) {
  return {
    count: payable.length,
    totalAmount: round2(payable.reduce((sum, row) => sum + row.outstanding, 0)),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

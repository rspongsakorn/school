export type DiscountReportItemRow = {
  feeItemId: string;
  feeItemName: string;
  /** Discounts given while taking a payment. */
  count: number;
  totalDiscount: number;
  /** Whole invoices closed with no cash (e.g. the insurance promotion). */
  waivedCount: number;
  waivedTotal: number;
};

export type DiscountReportResult = {
  rows: DiscountReportItemRow[];
  paymentTotal: number;
  waivedTotal: number;
  grandTotal: number;
};

export type PaymentDiscountInput = { feeItemId: string; feeItemName: string; amount: number };
export type WaiverLine = { feeItemId: string; feeItemName: string; amount: number };
export type WaiverInput = { discountValue: number; lines: WaiverLine[] };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Splits a waived invoice's discount across its lines in proportion to each
 * line's price, the remainder landing on the last line so the parts add back
 * to the discount. An insurance-only invoice has one line and gets all of it.
 */
export function allocateWaiverToLines(discountValue: number, lines: WaiverLine[]): WaiverLine[] {
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  if (lines.length === 0 || total <= 0) return [];

  let allocated = 0;
  return lines.map((line, i) => {
    const isLast = i === lines.length - 1;
    const amount = isLast
      ? round2(discountValue - allocated)
      : round2((discountValue * line.amount) / total);
    allocated = round2(allocated + amount);
    return { feeItemId: line.feeItemId, feeItemName: line.feeItemName, amount };
  });
}

export function buildDiscountReport(
  paymentDiscounts: PaymentDiscountInput[],
  waivers: WaiverInput[],
): DiscountReportResult {
  const byItem = new Map<string, DiscountReportItemRow>();
  const rowFor = (feeItemId: string, feeItemName: string) => {
    let row = byItem.get(feeItemId);
    if (!row) {
      row = { feeItemId, feeItemName, count: 0, totalDiscount: 0, waivedCount: 0, waivedTotal: 0 };
      byItem.set(feeItemId, row);
    }
    return row;
  };

  let paymentTotal = 0;
  for (const d of paymentDiscounts) {
    const row = rowFor(d.feeItemId, d.feeItemName);
    row.count += 1;
    row.totalDiscount = round2(row.totalDiscount + d.amount);
    paymentTotal += d.amount;
  }

  let waivedTotal = 0;
  for (const w of waivers) {
    for (const part of allocateWaiverToLines(w.discountValue, w.lines)) {
      const row = rowFor(part.feeItemId, part.feeItemName);
      row.waivedCount += 1;
      row.waivedTotal = round2(row.waivedTotal + part.amount);
      waivedTotal += part.amount;
    }
  }

  paymentTotal = round2(paymentTotal);
  waivedTotal = round2(waivedTotal);

  return {
    rows: [...byItem.values()].sort(
      (a, b) => b.totalDiscount + b.waivedTotal - (a.totalDiscount + a.waivedTotal),
    ),
    paymentTotal,
    waivedTotal,
    grandTotal: round2(paymentTotal + waivedTotal),
  };
}

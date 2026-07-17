export type ReceiptAllocationRaw = {
  amount: string;
  student_invoices: {
    invoice_types: { name: string } | null;
    invoice_lines: Array<{
      amount: string;
      fee_items: { name: string } | null;
    }>;
  } | null;
};

export type ReceiptDiscountRaw = {
  amount: string;
  fee_items: { name: string } | null;
};

export type ReceiptLineItem = { name: string; amount: number };
export type ReceiptDiscount = { name: string; amount: number };

export type ReceiptLineItemsResult = {
  lineItems: ReceiptLineItem[];
  subtotal: number;
  discounts: ReceiptDiscount[];
};

/**
 * Turns a payment's raw allocations/discounts into what the receipt shows.
 * Full or discounted payments expand to each fee line at its real amount.
 * An undiscounted partial payment also expands to each fee line, but scaled
 * proportionally to the amount actually paid (its true per-fee split isn't
 * knowable from a partial amount), with the last line absorbing any
 * rounding remainder so the lines still sum exactly to the paid amount.
 */
export function computeReceiptLineItems(
  paymentAllocations: ReceiptAllocationRaw[],
  paymentDiscounts: ReceiptDiscountRaw[],
): ReceiptLineItemsResult {
  const hasDiscount = paymentDiscounts.length > 0;

  const lineItems = paymentAllocations.flatMap((pa) => {
    const inv = pa.student_invoices;
    if (!inv) return [];
    const allocAmount = Number(pa.amount);
    const lines = inv.invoice_lines ?? [];
    const linesTotal =
      Math.round(lines.reduce((sum, l) => sum + Number(l.amount), 0) * 100) / 100;

    if (lines.length === 0) {
      return [{ name: inv.invoice_types?.name ?? "รายการค่าธรรมเนียม", amount: allocAmount }];
    }

    if (hasDiscount || Math.round(allocAmount * 100) / 100 === linesTotal) {
      return lines.map((line) => ({
        name: line.fee_items?.name ?? "รายการค่าธรรมเนียม",
        amount: Number(line.amount),
      }));
    }

    const ratio = linesTotal === 0 ? 0 : allocAmount / linesTotal;
    let allocated = 0;
    return lines.map((line, i) => {
      const isLast = i === lines.length - 1;
      const amount = isLast
        ? Math.round((allocAmount - allocated) * 100) / 100
        : Math.round(Number(line.amount) * ratio * 100) / 100;
      allocated += amount;
      return { name: line.fee_items?.name ?? "รายการค่าธรรมเนียม", amount };
    });
  });

  const discounts = paymentDiscounts.map((d) => ({
    name: d.fee_items?.name ?? "ส่วนลด",
    amount: Number(d.amount),
  }));

  const subtotal = Math.round(lineItems.reduce((sum, li) => sum + li.amount, 0) * 100) / 100;

  return { lineItems, subtotal, discounts };
}

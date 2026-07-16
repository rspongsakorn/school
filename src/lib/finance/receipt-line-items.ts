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
 * Turns a payment's raw allocations/discounts into what the receipt shows:
 * full or discounted payments expand to each fee line; an undiscounted
 * partial payment collapses to one line (its true per-fee split isn't
 * knowable from a partial amount) so the printed total can't mismatch.
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

    if (hasDiscount || Math.round(allocAmount * 100) / 100 === linesTotal) {
      return lines.map((line) => ({
        name: line.fee_items?.name ?? "รายการค่าธรรมเนียม",
        amount: Number(line.amount),
      }));
    }

    return [{ name: inv.invoice_types?.name ?? "รายการค่าธรรมเนียม", amount: allocAmount }];
  });

  const discounts = paymentDiscounts.map((d) => ({
    name: d.fee_items?.name ?? "ส่วนลด",
    amount: Number(d.amount),
  }));

  const subtotal = Math.round(lineItems.reduce((sum, li) => sum + li.amount, 0) * 100) / 100;

  return { lineItems, subtotal, discounts };
}

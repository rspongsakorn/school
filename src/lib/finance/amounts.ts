export type DiscountType = "percent" | "fixed" | null;

export function computeInvoiceTotal(
  subtotal: number,
  discountType: DiscountType,
  discountValue: number | null,
): number {
  if (!discountType || discountValue == null) return round2(subtotal);
  if (discountType === "percent") {
    return round2(subtotal * (1 - discountValue / 100));
  }
  return round2(Math.max(0, subtotal - discountValue));
}

export function deriveInvoiceStatus(
  paidAmount: number,
  totalAmount: number,
): "unpaid" | "partial" | "paid" {
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount < totalAmount) return "partial";
  return "paid";
}

export function allocatePaymentFifo(
  paymentAmount: number,
  invoices: { id: string; createdAt: string; outstanding: number }[],
) {
  const sorted = [...invoices]
    .filter((i) => i.outstanding > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let remaining = paymentAmount;
  const allocations: { invoiceId: string; amount: number }[] = [];

  for (const inv of sorted) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, inv.outstanding);
    allocations.push({ invoiceId: inv.id, amount: round2(amount) });
    remaining = round2(remaining - amount);
  }

  return allocations;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

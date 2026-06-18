export type DiscountType = "percent" | "fixed";

export type DiscountInput = {
  invoiceLineId: string;
  discountType: DiscountType;
  discountValue: number;
};

export type InvoiceLineLite = {
  id: string;
  feeItemId: string;
  amount: number;
};

export type ResolvedDiscountRow = {
  invoiceLineId: string;
  feeItemId: string;
  discountType: DiscountType;
  discountValue: number;
  amount: number;
};

export type ResolvePaymentDiscountsResult =
  | { ok: true; rows: ResolvedDiscountRow[]; totalDiscount: number; netDue: number }
  | { ok: false; error: string };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function resolveLineDiscount(
  lineAmount: number,
  discountType: DiscountType,
  discountValue: number,
): number {
  if (discountType === "percent") {
    return round2(lineAmount * (discountValue / 100));
  }
  return round2(discountValue);
}

export function resolvePaymentDiscounts(
  subtotal: number,
  lines: InvoiceLineLite[],
  input: DiscountInput[],
): ResolvePaymentDiscountsResult {
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const rows: ResolvedDiscountRow[] = [];

  for (const d of input) {
    const line = lineById.get(d.invoiceLineId);
    if (!line) {
      return { ok: false, error: "ส่วนลดอ้างถึงรายการที่ไม่อยู่ในใบแจ้ง" };
    }
    if (!Number.isFinite(d.discountValue) || d.discountValue < 0) {
      return { ok: false, error: "มูลค่าส่วนลดไม่ถูกต้อง" };
    }
    if (d.discountType === "percent" && d.discountValue > 100) {
      return { ok: false, error: "ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100" };
    }
    const amount = resolveLineDiscount(line.amount, d.discountType, d.discountValue);
    if (amount > line.amount) {
      return { ok: false, error: "ส่วนลดเกินราคาของรายการ" };
    }
    rows.push({
      invoiceLineId: line.id,
      feeItemId: line.feeItemId,
      discountType: d.discountType,
      discountValue: d.discountValue,
      amount,
    });
  }

  const totalDiscount = round2(rows.reduce((sum, r) => sum + r.amount, 0));
  const netDue = round2(subtotal - totalDiscount);
  if (netDue <= 0) {
    return { ok: false, error: "ยอดสุทธิหลังหักส่วนลดต้องมากกว่า 0" };
  }

  return { ok: true, rows, totalDiscount, netDue };
}

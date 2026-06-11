export type SingleInvoicePaymentInput = {
  amount: number;
  outstanding: number;
};

export type SingleInvoicePaymentResult =
  | { ok: true; amount: number }
  | { ok: false; error: string };

export function resolveSingleInvoicePayment(
  input: SingleInvoicePaymentInput,
): SingleInvoicePaymentResult {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: "จำนวนเงินต้องมากกว่า 0" };
  }
  if (input.outstanding <= 0) {
    return { ok: false, error: "ใบแจ้งนี้ไม่มียอดค้างชำระ" };
  }
  if (input.amount > input.outstanding) {
    return { ok: false, error: "จำนวนเงินเกินยอดค้างของใบแจ้งนี้" };
  }
  return { ok: true, amount: input.amount };
}

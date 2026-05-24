export const INVOICE_STATUS_LABELS = {
  unpaid: "ค้างชำระ",
  partial: "ชำระบางส่วน",
  paid: "ชำระแล้ว",
} as const;

export const PAYMENT_METHOD_LABELS = {
  cash: "เงินสด",
  transfer: "โอนเงิน",
} as const;

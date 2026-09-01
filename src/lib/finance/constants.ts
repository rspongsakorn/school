export const INVOICE_STATUS_LABELS = {
  unpaid: "ค้างชำระ",
  partial: "ชำระบางส่วน",
  paid: "ชำระแล้ว",
} as const;

export const PAYMENT_METHOD_LABELS = {
  cash: "เงินสด",
  transfer: "โอนเงิน",
} as const;

/** Most invoices one bulk payment may charge in a single action. Matches the invoices page's page size. */
export const BULK_PAYMENT_MAX = 100;

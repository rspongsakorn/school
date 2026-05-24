const PAID_TOLERANCE = 0.001;

export type InvoiceDeleteContext = {
  paidAmount: number;
  totalAmount: number;
  hasActivePaymentAllocation: boolean;
};

export function canDeleteInvoice(ctx: InvoiceDeleteContext): boolean {
  if (ctx.hasActivePaymentAllocation) return false;
  return ctx.paidAmount <= PAID_TOLERANCE;
}

export function invoiceDeleteBlockedReason(ctx: InvoiceDeleteContext): string | null {
  if (canDeleteInvoice(ctx)) return null;
  if (ctx.hasActivePaymentAllocation) {
    return "ยกเลิกใบเสร็จที่เกี่ยวข้องทั้งหมดก่อน";
  }
  if (ctx.paidAmount > PAID_TOLERANCE) {
    return "ต้องยกเลิกใบเสร็จทั้งหมดก่อน";
  }
  return "ไม่สามารถลบใบแจ้งชำระนี้ได้";
}

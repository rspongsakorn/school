const PAID_TOLERANCE = 0.001;

// Same keyword the XLSX import uses to find the insurance fee line.
const INSURANCE_KEYWORD = "ประกัน";

export const INSURANCE_WAIVER_DEFAULT_REASON = "โปรโมชั่นชำระค่าเทอมก่อน 31 พ.ค.";

export type InsuranceWaiverContext = {
  paidAmount: number;
  discountValue: number;
  lineNames: string[];
  alreadyWaived: boolean;
};

export function insuranceWaiverBlockedReason(ctx: InsuranceWaiverContext): string | null {
  if (ctx.alreadyWaived) return "ใบแจ้งนี้ถูกยกเว้นไปแล้ว";
  if (ctx.paidAmount > PAID_TOLERANCE) return "ใบแจ้งนี้มีการชำระเงินแล้ว";
  if (ctx.discountValue > PAID_TOLERANCE) return "ใบแจ้งนี้มีส่วนลดอยู่แล้ว";
  const onlyInsurance =
    ctx.lineNames.length > 0 && ctx.lineNames.every((name) => name.includes(INSURANCE_KEYWORD));
  if (!onlyInsurance) return "ยกเว้นทั้งใบได้เฉพาะใบที่มีแต่ค่าประกัน";
  return null;
}

export function canWaiveInsuranceInvoice(ctx: InsuranceWaiverContext): boolean {
  return insuranceWaiverBlockedReason(ctx) === null;
}

export type FeeItemReferenceCounts = {
  feeRates: number | null;
  invoiceLines: number | null;
};

export function feeItemCanDelete(counts: FeeItemReferenceCounts): boolean {
  return (counts.feeRates ?? 0) + (counts.invoiceLines ?? 0) === 0;
}

export function feeItemDeleteBlockedReason(counts: FeeItemReferenceCounts): string | null {
  if (feeItemCanDelete(counts)) return null;
  const inRates = (counts.feeRates ?? 0) > 0;
  const inInvoices = (counts.invoiceLines ?? 0) > 0;
  if (inRates && inInvoices) return "มีอัตราค่าธรรมเนียมและใบแจ้งชำระอ้างถึง";
  if (inRates) return "มีอัตราค่าธรรมเนียมอ้างถึง";
  return "มีใบแจ้งชำระอ้างถึง";
}

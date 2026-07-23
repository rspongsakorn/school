export type PaymentAllocationRow = {
  invoiceId: string;
  paidAt: string;
  status: "active" | "voided";
};

export function latestPaidAtByInvoice(rows: PaymentAllocationRow[]): Map<string, string> {
  const result = new Map<string, string>();

  for (const row of rows) {
    if (row.status !== "active") continue;
    const current = result.get(row.invoiceId);
    if (!current || row.paidAt > current) {
      result.set(row.invoiceId, row.paidAt);
    }
  }

  return result;
}

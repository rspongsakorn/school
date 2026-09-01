import { requireFinancePage } from "@/lib/auth/require-finance";
import { InvoicesPanel } from "@/components/finance/invoices-panel";

/**
 * Bulk payment (`recordPaymentsBulk`) is invoked from this route, and it walks
 * the selected invoices sequentially — two round trips each: re-read the
 * balance, then the `record_payment` transaction. A classroom of ~40 students
 * therefore runs well past the 10s default a serverless host typically applies,
 * and a timeout mid-loop is the worst case there is: some payments are already
 * committed but the cashier never sees their receipt numbers.
 */
export const maxDuration = 60;

export default async function InvoicesPage() {
  await requireFinancePage();
  return <InvoicesPanel />;
}

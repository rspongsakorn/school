import { requireFinancePage } from "@/lib/auth/require-finance";
import { InvoicesPanel } from "@/components/finance/invoices-panel";

export default async function InvoicesPage() {
  await requireFinancePage();
  return <InvoicesPanel />;
}

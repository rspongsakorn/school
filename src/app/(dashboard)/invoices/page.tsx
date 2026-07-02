import { requireAdminPage } from "@/lib/auth/require-admin";
import { InvoicesPanel } from "@/components/finance/invoices-panel";

export default async function InvoicesPage() {
  await requireAdminPage();
  return <InvoicesPanel />;
}

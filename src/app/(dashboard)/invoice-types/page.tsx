import { requireAdminPage } from "@/lib/auth/require-admin";
import { InvoiceTypesPanel } from "@/components/finance/invoice-types-panel";

export default async function InvoiceTypesPage() {
  await requireAdminPage();
  return <InvoiceTypesPanel />;
}

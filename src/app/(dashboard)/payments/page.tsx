import { requireFinancePage } from "@/lib/auth/require-finance";
import { PaymentsPanel } from "@/components/finance/payments-panel";

export default async function PaymentsPage() {
  await requireFinancePage();
  return <PaymentsPanel />;
}

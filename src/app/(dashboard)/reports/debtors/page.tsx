import { requireFinancePage } from "@/lib/auth/require-finance";
import { DebtorsReportPanel } from "@/components/finance/debtors-report-panel";

export default async function DebtorsReportPage() {
  await requireFinancePage();
  return <DebtorsReportPanel />;
}

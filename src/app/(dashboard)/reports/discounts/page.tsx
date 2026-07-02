import { requireFinancePage } from "@/lib/auth/require-finance";
import { DiscountReportPanel } from "@/components/finance/discount-report-panel";

export default async function DiscountReportPage() {
  await requireFinancePage();
  return <DiscountReportPanel />;
}

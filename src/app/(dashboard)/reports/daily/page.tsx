import { requireFinancePage } from "@/lib/auth/require-finance";
import { DailyRevenuePanel } from "@/components/finance/daily-revenue-panel";

export default async function DailyRevenuePage() {
  await requireFinancePage();
  return <DailyRevenuePanel />;
}

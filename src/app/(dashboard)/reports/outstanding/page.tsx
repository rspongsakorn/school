import { requireReportPage } from "@/lib/auth/require-finance";
import { OutstandingReportPanel } from "@/components/finance/outstanding-report-panel";

export default async function OutstandingReportPage() {
  await requireReportPage();
  return <OutstandingReportPanel />;
}

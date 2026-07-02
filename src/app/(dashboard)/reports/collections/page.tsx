import { requireReportPage } from "@/lib/auth/require-finance";
import { CollectionsReportPanel } from "@/components/finance/collections-report-panel";

export default async function CollectionsReportPage() {
  await requireReportPage();
  return <CollectionsReportPanel />;
}

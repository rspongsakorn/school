import { requireReportPage } from "@/lib/auth/require-finance";
import { StudentRosterPanel } from "@/components/finance/student-roster-panel";

export default async function StudentRosterPage() {
  await requireReportPage();
  return <StudentRosterPanel />;
}

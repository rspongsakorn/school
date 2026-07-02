import { requireReportPage } from "@/lib/auth/require-finance";
import { StudentStatementPanel } from "@/components/finance/student-statement-panel";

export default async function StudentStatementPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  await requireReportPage();
  const { studentId } = await params;
  return <StudentStatementPanel studentId={studentId} />;
}

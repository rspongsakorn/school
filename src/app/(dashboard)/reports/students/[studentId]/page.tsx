import { StudentStatementPanel } from "@/components/finance/student-statement-panel";

export default async function StudentStatementPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  return <StudentStatementPanel studentId={studentId} />;
}

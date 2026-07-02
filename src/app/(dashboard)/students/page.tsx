import { requireFinancePage } from "@/lib/auth/require-finance";
import { StudentsPanel } from "@/components/students/students-panel";

export default async function StudentsPage() {
  await requireFinancePage();
  return <StudentsPanel />;
}

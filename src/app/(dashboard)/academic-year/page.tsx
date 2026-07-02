import { requireAdminPage } from "@/lib/auth/require-admin";
import { AcademicYearPanel } from "@/components/academic-year/academic-year-panel";

export default async function AcademicYearPage() {
  await requireAdminPage();
  return <AcademicYearPanel />;
}

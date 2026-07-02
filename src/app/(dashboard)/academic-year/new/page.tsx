import { requireAdminPage } from "@/lib/auth/require-admin";
import { NewAcademicYearShell } from "@/components/academic-year/new-academic-year-shell";

export default async function NewAcademicYearPage() {
  await requireAdminPage();
  return <NewAcademicYearShell />;
}

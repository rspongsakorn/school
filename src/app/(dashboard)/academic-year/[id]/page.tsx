import { requireAdminPage } from "@/lib/auth/require-admin";
import { EditAcademicYearWrapper } from "@/components/academic-year/edit-academic-year-wrapper";

export default async function AcademicYearEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  return <EditAcademicYearWrapper id={id} />;
}

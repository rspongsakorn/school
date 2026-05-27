import { EditAcademicYearWrapper } from "@/components/academic-year/edit-academic-year-wrapper";

export default async function AcademicYearEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditAcademicYearWrapper id={id} />;
}

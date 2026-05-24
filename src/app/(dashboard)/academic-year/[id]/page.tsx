import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AcademicYearFormPage } from "@/components/academic-year/academic-year-form-page";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getAcademicYearById } from "@/lib/data/academic-years";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAcademicYearPage({ params }: PageProps) {
  const { id } = await params;
  const [profile, year] = await Promise.all([requireAdminPage(), getAcademicYearById(id)]);

  if (!year) {
    notFound();
  }

  return (
    <>
      <AppHeader
        title="แก้ไขปีการศึกษา"
        displayName={profile.display_name ?? "ผู้ใช้"}
        showContextSelectors={false}
      />
      <main className="p-6">
        <AcademicYearFormPage mode="edit" year={year} />
      </main>
    </>
  );
}

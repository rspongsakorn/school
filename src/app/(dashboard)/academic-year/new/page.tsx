import { AppHeader } from "@/components/app-header";
import { AcademicYearFormPage } from "@/components/academic-year/academic-year-form-page";
import { requireAdminPage } from "@/lib/auth/require-admin";

export default async function NewAcademicYearPage() {
  const profile = await requireAdminPage();

  return (
    <>
      <AppHeader
        title="เพิ่มปีการศึกษา"
        displayName={profile.display_name ?? "ผู้ใช้"}
        showContextSelectors={false}
      />
      <main className="p-6">
        <AcademicYearFormPage mode="create" />
      </main>
    </>
  );
}

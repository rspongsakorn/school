import { AppHeader } from "@/components/app-header";
import { AcademicYearPanel } from "@/components/academic-year/academic-year-panel";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listAcademicYears } from "@/lib/data/academic-years";

export default async function AcademicYearPage() {
  const profile = await requireAdminPage();
  const years = await listAcademicYears();

  return (
    <>
      <AppHeader
        title="ปีการศึกษา"
        displayName={profile.display_name ?? "ผู้ใช้"}
        showContextSelectors={false}
      />
      <main className="p-6">
        <AcademicYearPanel years={years} />
      </main>
    </>
  );
}

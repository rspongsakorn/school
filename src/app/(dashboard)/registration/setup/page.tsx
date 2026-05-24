import { AppHeader } from "@/components/app-header";
import { SetupPanel } from "@/components/registration/setup-panel";
import { getCurrentProfileRole } from "@/lib/auth/require-admin";
import { listAcademicYearOptions } from "@/lib/data/academic-years";
import { listClassroomsByGrade } from "@/lib/data/classrooms";
import { listGradeLevels } from "@/lib/data/grade-levels";
import { getYearSemesterContext } from "@/lib/data/context";
import { resolveSelectedYearId } from "@/lib/enrollment/year-params";

type SearchParams = Promise<{ year?: string; grade?: string }>;

export default async function RegistrationSetupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const [profile, years, context] = await Promise.all([
    getCurrentProfileRole(),
    listAcademicYearOptions(),
    getYearSemesterContext(),
  ]);

  const selectedYearId = resolveSelectedYearId(sp.year, years);
  const grades = selectedYearId ? await listGradeLevels(selectedYearId) : [];
  const selectedGradeId =
    sp.grade && grades.some((g) => g.id === sp.grade) ? sp.grade : grades[0]?.id ?? null;
  const classrooms = selectedGradeId ? await listClassroomsByGrade(selectedGradeId) : [];
  const isAdmin = profile?.role === "admin";

  return (
    <>
      <AppHeader
        title="ตั้งค่าชั้น/ห้อง"
        displayName={profile?.display_name ?? "ผู้ใช้"}
        yearName={context?.academicYearName}
        semesterNumber={context?.semesterNumber}
      />
      <main className="p-6">
        {selectedYearId ? (
          <SetupPanel
            years={years}
            selectedYearId={selectedYearId}
            grades={grades}
            classrooms={classrooms}
            isAdmin={isAdmin}
            initialGradeId={selectedGradeId ?? undefined}
          />
        ) : (
          <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษาในระบบ</p>
        )}
      </main>
    </>
  );
}

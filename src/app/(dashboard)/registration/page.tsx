import { AppHeader } from "@/components/app-header";
import { RegistrationPanel } from "@/components/registration/registration-panel";
import { getCurrentProfileRole } from "@/lib/auth/require-admin";
import { listAcademicYearOptions } from "@/lib/data/academic-years";
import { listClassroomsByGrade, listClassroomsByYear } from "@/lib/data/classrooms";
import {
  listClassroomRoster,
  listStudentsAvailableForEnrollment,
} from "@/lib/data/enrollments";
import { listGradeLevels } from "@/lib/data/grade-levels";
import { getYearSemesterContext } from "@/lib/data/context";
import { resolveSelectedYearId } from "@/lib/enrollment/year-params";

type SearchParams = Promise<{ year?: string; grade?: string; classroom?: string }>;

export default async function RegistrationPage({
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
  const selectedClassroomId =
    sp.classroom && classrooms.some((c) => c.id === sp.classroom)
      ? sp.classroom
      : classrooms[0]?.id ?? null;

  const [roster, allClassrooms, enrollCandidates] = await Promise.all([
    selectedClassroomId ? listClassroomRoster(selectedClassroomId) : Promise.resolve([]),
    selectedYearId ? listClassroomsByYear(selectedYearId) : Promise.resolve([]),
    selectedYearId ? listStudentsAvailableForEnrollment(selectedYearId) : Promise.resolve([]),
  ]);

  const isAdmin = profile?.role === "admin";

  return (
    <>
      <AppHeader
        title="ลงทะเบียนนักเรียน"
        displayName={profile?.display_name ?? "ผู้ใช้"}
        yearName={context?.academicYearName}
        semesterNumber={context?.semesterNumber}
      />
      <main className="p-6">
        {selectedYearId ? (
          <RegistrationPanel
            years={years}
            selectedYearId={selectedYearId}
            grades={grades}
            selectedGradeId={selectedGradeId}
            classrooms={classrooms}
            selectedClassroomId={selectedClassroomId}
            roster={roster}
            allClassrooms={allClassrooms}
            enrollCandidates={enrollCandidates}
            isAdmin={isAdmin}
          />
        ) : (
          <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษาในระบบ</p>
        )}
      </main>
    </>
  );
}

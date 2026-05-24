import { AppHeader } from "@/components/app-header";
import { RegistrationPanel } from "@/components/registration/registration-panel";
import { getCurrentProfileRole } from "@/lib/auth/require-admin";
import { listClassroomsByGrade, listClassroomsBySemester } from "@/lib/data/classrooms";
import {
  listClassroomRoster,
  listStudentsAvailableForEnrollment,
} from "@/lib/data/enrollments";
import { listGradeLevels } from "@/lib/data/grade-levels";
import {
  buildHeaderContextProps,
  loadSemesterPageContext,
} from "@/lib/data/semester-page-context";
import { listSemestersWithGradeLevels } from "@/lib/data/semesters";

type SearchParams = Promise<{
  year?: string;
  semester?: string;
  grade?: string;
  classroom?: string;
}>;

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const [profile, page] = await Promise.all([
    getCurrentProfileRole(),
    loadSemesterPageContext(sp.year, sp.semester),
  ]);

  const ctx = page.ctx;
  const grades = ctx ? await listGradeLevels(ctx.semesterId) : [];
  const selectedGradeId =
    sp.grade && grades.some((g) => g.id === sp.grade) ? sp.grade : grades[0]?.id ?? null;

  const classrooms = selectedGradeId ? await listClassroomsByGrade(selectedGradeId) : [];
  const selectedClassroomId =
    sp.classroom && classrooms.some((c) => c.id === sp.classroom)
      ? sp.classroom
      : classrooms[0]?.id ?? null;

  const [roster, allClassrooms, enrollCandidates, sourceSemesters] = await Promise.all([
    selectedClassroomId ? listClassroomRoster(selectedClassroomId) : Promise.resolve([]),
    ctx ? listClassroomsBySemester(ctx.semesterId) : Promise.resolve([]),
    ctx ? listStudentsAvailableForEnrollment(ctx.semesterId) : Promise.resolve([]),
    ctx ? listSemestersWithGradeLevels(ctx.academicYearId) : Promise.resolve([]),
  ]);

  const isAdmin = profile?.role === "admin";
  const headerContext = buildHeaderContextProps(page, "/registration", {
    clearGradeClassroomOnChange: true,
  });

  return (
    <>
      <AppHeader
        title="ลงทะเบียน"
        displayName={profile?.display_name ?? "ผู้ใช้"}
        showContextSelectors={Boolean(headerContext)}
        context={headerContext}
      />
      <main className="p-6">
        {ctx ? (
          <RegistrationPanel
            semesterId={ctx.semesterId}
            semesterNumber={ctx.semesterNumber}
            academicYearId={ctx.academicYearId}
            grades={grades}
            selectedGradeId={selectedGradeId}
            classrooms={classrooms}
            selectedClassroomId={selectedClassroomId}
            roster={roster}
            allClassrooms={allClassrooms}
            enrollCandidates={enrollCandidates}
            sourceSemesters={sourceSemesters}
            isAdmin={isAdmin}
          />
        ) : (
          <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษาในระบบ</p>
        )}
      </main>
    </>
  );
}

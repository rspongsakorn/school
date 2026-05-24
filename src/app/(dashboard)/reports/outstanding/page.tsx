import { AppHeader } from "@/components/app-header";
import { OutstandingReportPanel } from "@/components/finance/outstanding-report-panel";
import { requireReportPage } from "@/lib/auth/require-finance";
import { listClassroomsBySemester } from "@/lib/data/classrooms";
import { listGradeLevels } from "@/lib/data/grade-levels";
import { getPageHeaderProps } from "@/lib/data/page-header";
import { listOutstandingReport } from "@/lib/data/reports";
import { loadSemesterPageContext } from "@/lib/data/semester-page-context";

type SearchParams = Promise<{
  year?: string;
  semester?: string;
  grade?: string;
  classroom?: string;
  status?: string;
}>;

export default async function OutstandingReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const profile = await requireReportPage();

  const [header, page] = await Promise.all([
    getPageHeaderProps("/reports/outstanding", sp),
    loadSemesterPageContext(sp.year, sp.semester),
  ]);

  if (!page.ctx) {
    return (
      <>
        <AppHeader title="รายงานค้างชำระ" {...header} />
        <main className="p-6">
          <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษา/ภาคเรียนในระบบ</p>
        </main>
      </>
    );
  }

  const status =
    sp.status === "unpaid" || sp.status === "partial" ? sp.status : ("all" as const);

  const teacherProfileId = profile.role === "teacher" ? profile.id : undefined;

  const [rows, grades, classrooms] = await Promise.all([
    listOutstandingReport({
      semesterId: page.ctx.semesterId,
      academicYearId: page.ctx.academicYearId,
      gradeLevelId: sp.grade && sp.grade !== "all" ? sp.grade : undefined,
      classroomId: sp.classroom && sp.classroom !== "all" ? sp.classroom : undefined,
      status,
      teacherProfileId,
    }),
    listGradeLevels(page.ctx.semesterId),
    listClassroomsBySemester(page.ctx.semesterId),
  ]);

  return (
    <>
      <AppHeader title="รายงานค้างชำระ" {...header} />
      <main className="p-6">
        <OutstandingReportPanel
          rows={rows}
          grades={grades}
          classrooms={classrooms}
          params={{
            grade: sp.grade ?? "all",
            classroom: sp.classroom ?? "all",
            status,
          }}
        />
      </main>
    </>
  );
}

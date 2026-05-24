import { AppHeader } from "@/components/app-header";
import { PaymentsPanel } from "@/components/finance/payments-panel";
import { requireFinancePage } from "@/lib/auth/require-finance";
import { listClassroomsBySemester } from "@/lib/data/classrooms";
import { listGradeLevels } from "@/lib/data/grade-levels";
import { listPaymentsFiltered } from "@/lib/data/payments";
import { getPageHeaderProps } from "@/lib/data/page-header";
import { loadSemesterPageContext } from "@/lib/data/semester-page-context";

type SearchParams = Promise<{
  year?: string;
  semester?: string;
  grade?: string;
  classroom?: string;
}>;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  await requireFinancePage();

  const [header, page] = await Promise.all([
    getPageHeaderProps("/payments", sp),
    loadSemesterPageContext(sp.year, sp.semester),
  ]);

  if (!page.ctx) {
    return (
      <>
        <AppHeader title="บันทึกการจ่าย" {...header} />
        <main className="p-6">
          <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษา/ภาคเรียนในระบบ</p>
        </main>
      </>
    );
  }

  const grade = sp.grade ?? "all";
  const classroom = sp.classroom ?? "all";

  const [grades, classrooms, filteredPayments] = await Promise.all([
    listGradeLevels(page.ctx.semesterId),
    listClassroomsBySemester(page.ctx.semesterId),
    listPaymentsFiltered({
      academicYearId: page.ctx.academicYearId,
      semesterId: page.ctx.semesterId,
      gradeLevelId: grade !== "all" ? grade : undefined,
      classroomId: classroom !== "all" ? classroom : undefined,
    }),
  ]);

  return (
    <>
      <AppHeader title="บันทึกการจ่าย" {...header} />
      <main className="p-6">
        <PaymentsPanel
          context={{
            semesterId: page.ctx.semesterId,
            academicYearId: page.ctx.academicYearId,
            academicYearName: page.ctx.academicYearName,
          }}
          params={{ grade, classroom }}
          grades={grades}
          classrooms={classrooms}
          filteredPayments={filteredPayments}
        />
      </main>
    </>
  );
}

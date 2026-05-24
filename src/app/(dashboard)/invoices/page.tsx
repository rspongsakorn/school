import { AppHeader } from "@/components/app-header";
import { InvoicesPanel } from "@/components/finance/invoices-panel";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listClassroomsBySemester } from "@/lib/data/classrooms";
import { listFeeItems } from "@/lib/data/fee-items";
import { listGradeLevels } from "@/lib/data/grade-levels";
import { listInvoiceCandidates, listInvoicesPaginated } from "@/lib/data/invoices";
import { getPageHeaderProps } from "@/lib/data/page-header";
import { loadSemesterPageContext } from "@/lib/data/semester-page-context";
import type { InvoiceStatus } from "@/lib/data/invoices";

type SearchParams = Promise<{
  year?: string;
  semester?: string;
  q?: string;
  status?: string;
  grade?: string;
  classroom?: string;
  page?: string;
}>;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  await requireAdminPage();

  const [header, page] = await Promise.all([
    getPageHeaderProps("/invoices", sp),
    loadSemesterPageContext(sp.year, sp.semester),
  ]);

  if (!page.ctx) {
    return (
      <>
        <AppHeader title="ใบแจ้งชำระ" {...header} />
        <main className="p-6">
          <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษา/ภาคเรียนในระบบ</p>
        </main>
      </>
    );
  }

  const { ctx } = page;
  const pageNum = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const status =
    sp.status === "unpaid" || sp.status === "partial" || sp.status === "paid"
      ? (sp.status as InvoiceStatus)
      : "all";

  const [data, feeItems, candidates, grades, classrooms] = await Promise.all([
    listInvoicesPaginated({
      semesterId: ctx.semesterId,
      academicYearId: ctx.academicYearId,
      q: sp.q,
      gradeLevelId: sp.grade && sp.grade !== "all" ? sp.grade : undefined,
      classroomId: sp.classroom && sp.classroom !== "all" ? sp.classroom : undefined,
      status,
      page: pageNum,
    }),
    listFeeItems(),
    listInvoiceCandidates(ctx.semesterId),
    listGradeLevels(ctx.semesterId),
    listClassroomsBySemester(ctx.semesterId),
  ]);

  return (
    <>
      <AppHeader title="ใบแจ้งชำระ" {...header} />
      <main className="p-6">
        <InvoicesPanel
          data={data}
          params={{
            q: sp.q ?? "",
            status: status,
            grade: sp.grade ?? "all",
            classroom: sp.classroom ?? "all",
            page: pageNum,
          }}
          feeItems={feeItems}
          candidates={candidates}
          grades={grades}
          classrooms={classrooms}
          context={{
            semesterId: ctx.semesterId,
            academicYearId: ctx.academicYearId,
            academicYearName: ctx.academicYearName,
            semesterNumber: ctx.semesterNumber,
          }}
        />
      </main>
    </>
  );
}

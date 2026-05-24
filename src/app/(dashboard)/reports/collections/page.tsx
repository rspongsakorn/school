import { AppHeader } from "@/components/app-header";
import { CollectionsReportPanel } from "@/components/finance/collections-report-panel";
import { requireReportPage } from "@/lib/auth/require-finance";
import { getPageHeaderProps } from "@/lib/data/page-header";
import { listCollectionsByGrade } from "@/lib/data/reports";
import { loadSemesterPageContext } from "@/lib/data/semester-page-context";

type SearchParams = Promise<{ year?: string; semester?: string }>;

export default async function CollectionsReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const profile = await requireReportPage();

  const [header, page] = await Promise.all([
    getPageHeaderProps("/reports/collections", sp),
    loadSemesterPageContext(sp.year, sp.semester),
  ]);

  if (!page.ctx) {
    return (
      <>
        <AppHeader title="สรุปการเก็บ" {...header} />
        <main className="p-6">
          <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษา/ภาคเรียนในระบบ</p>
        </main>
      </>
    );
  }

  const teacherProfileId = profile.role === "teacher" ? profile.id : undefined;
  const rows = await listCollectionsByGrade(
    page.ctx.semesterId,
    page.ctx.academicYearId,
    teacherProfileId,
  );

  return (
    <>
      <AppHeader title="สรุปการเก็บ" {...header} />
      <main className="p-6">
        <CollectionsReportPanel rows={rows} />
      </main>
    </>
  );
}

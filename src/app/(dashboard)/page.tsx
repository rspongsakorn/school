import { AppHeader } from "@/components/app-header";
import { GradeStats } from "@/components/dashboard/grade-stats";
import { OverdueList } from "@/components/dashboard/overdue-list";
import { RecentPaymentsTable } from "@/components/dashboard/recent-payments-table";
import { StatCards } from "@/components/dashboard/stat-cards";
import { getCurrentProfile } from "@/lib/data/context";
import { getDashboardData } from "@/lib/data/dashboard";
import {
  buildHeaderContextProps,
  loadSemesterPageContext,
} from "@/lib/data/semester-page-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SearchParams = Promise<{ year?: string; semester?: string }>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const [profile, page] = await Promise.all([
    getCurrentProfile(),
    loadSemesterPageContext(sp.year, sp.semester),
  ]);

  const context = page.ctx
    ? {
        academicYearId: page.ctx.academicYearId,
        academicYearName: page.ctx.academicYearName,
        semesterId: page.ctx.semesterId,
        semesterNumber: page.ctx.semesterNumber,
      }
    : null;

  const dashboard = await getDashboardData(context);
  const headerContext = buildHeaderContextProps(page, "/");

  return (
    <>
      <AppHeader
        title="ภาพรวม"
        displayName={profile?.display_name ?? "ผู้ใช้"}
        showContextSelectors={Boolean(headerContext)}
        context={headerContext}
      />
      <main className="p-6">
        {!context ? (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="text-base">ยังไม่มีปีการศึกษา</CardTitle>
              <CardDescription>
                สร้างปีการศึกษาและภาคเรียนใน Supabase (ตาราง academic_years, semesters)
                แล้วตั้ง is_active = true
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              แดชบอร์ดจะแสดงข้อมูลจริงเมื่อมีปีการศึกษาที่ใช้งานอยู่
            </CardContent>
          </Card>
        ) : null}
        <div className="space-y-6">
          <StatCards stats={dashboard.stats} />
          <RecentPaymentsTable payments={dashboard.recentPayments} />
          <div className="grid gap-6 lg:grid-cols-2">
            <OverdueList students={dashboard.overdueStudents} />
            <GradeStats
              gradeStats={dashboard.gradeStats}
              yearName={context?.academicYearName}
              semesterNumber={context?.semesterNumber}
            />
          </div>
        </div>
      </main>
    </>
  );
}

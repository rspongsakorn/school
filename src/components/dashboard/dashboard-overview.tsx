"use client";

import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchDashboardData } from "@/lib/queries/dashboard";
import { StatCards } from "@/components/dashboard/stat-cards";
import { RecentPaymentsTable } from "@/components/dashboard/recent-payments-table";
import { OverdueList } from "@/components/dashboard/overdue-list";
import { GradeStats } from "@/components/dashboard/grade-stats";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DashboardOverview() {
  const { ctx, isLoading: ctxLoading } = useSemesterContext();

  const { data: dashboard, isLoading: dataLoading } = useQuery({
    queryKey: ["dashboard", ctx?.semesterId, ctx?.academicYearId],
    queryFn: () => fetchDashboardData(ctx ?? null),
    enabled: !ctxLoading,
    staleTime: 30_000,
  });

  const isLoading = ctxLoading || dataLoading;

  return (
    <>
      <AppHeader title="ภาพรวม" basePath="/" />
      <main className="p-4 lg:p-6">
        {!ctx && !ctxLoading ? (
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
        {isLoading ? (
          <div className="space-y-6">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
            <div className="h-48 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : dashboard ? (
          <div className="space-y-6">
            <StatCards stats={dashboard.stats} />
            <RecentPaymentsTable payments={dashboard.recentPayments} />
            <div className="grid gap-6 lg:grid-cols-2">
              <OverdueList students={dashboard.overdueStudents} />
              <GradeStats
                gradeStats={dashboard.gradeStats}
                yearName={ctx?.academicYearName}
                semesterNumber={ctx?.semesterNumber}
              />
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

"use client";

import Link from "next/link";
import { Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchDashboardData } from "@/lib/queries/dashboard";
import { StatCards } from "@/components/dashboard/stat-cards";
import { RecentPaymentsTable } from "@/components/dashboard/recent-payments-table";
import { OverdueList } from "@/components/dashboard/overdue-list";
import { GradeStats } from "@/components/dashboard/grade-stats";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DashboardOverview() {
  const { ctx, isLoading: ctxLoading } = useSemesterContext();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

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
          <Card className="mx-auto mt-10 max-w-md border-border text-center shadow-sm">
            <CardHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-base">ยังไม่มีปีการศึกษา</CardTitle>
              <CardDescription>
                เริ่มต้นใช้งานระบบโดยการสร้างปีการศึกษาและภาคเรียนก่อน
                แดชบอร์ดจะแสดงข้อมูลเมื่อมีปีการศึกษาที่ใช้งานอยู่
              </CardDescription>
            </CardHeader>
            {isAdmin ? (
              <CardContent>
                <Link href="/academic-year/new" className={cn(buttonVariants())}>
                  <Calendar className="mr-1 h-4 w-4" />
                  สร้างปีการศึกษา
                </Link>
              </CardContent>
            ) : (
              <CardContent className="text-sm text-muted-foreground">
                กรุณาติดต่อผู้ดูแลระบบเพื่อสร้างปีการศึกษา
              </CardContent>
            )}
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

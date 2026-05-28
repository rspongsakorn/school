"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { YearTable } from "@/components/academic-year/year-table";
import { useRequireRole } from "@/components/providers/auth-provider";
import { fetchAcademicYears } from "@/lib/queries/academic-years";

export function AcademicYearPanel() {
  useRequireRole("admin");

  const { data: years = [], isLoading } = useQuery({
    queryKey: ["academic-years-full"],
    queryFn: fetchAcademicYears,
    staleTime: 30_000,
  });

  return (
    <>
      <AppHeader title="ปีการศึกษา" />
      <main className="p-4 lg:p-6">
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        ) : (
          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle>จัดการปีการศึกษา</CardTitle>
                <CardDescription>
                  กำหนดช่วงปีการศึกษาและภาคเรียนสำหรับการใช้งานในระบบ
                </CardDescription>
              </div>
              <Link href="/academic-year/new" className={cn(buttonVariants())}>
                เพิ่มปีการศึกษา
              </Link>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <YearTable years={years} />
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}

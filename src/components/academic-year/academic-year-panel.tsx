import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AcademicYearRow } from "@/lib/data/academic-years";
import { YearTable } from "@/components/academic-year/year-table";

type AcademicYearPanelProps = {
  years: AcademicYearRow[];
};

export function AcademicYearPanel({ years }: AcademicYearPanelProps) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle>จัดการปีการศึกษา</CardTitle>
          <CardDescription>กำหนดช่วงปีการศึกษาและภาคเรียนสำหรับการใช้งานในระบบ</CardDescription>
        </div>
        <Link href="/academic-year/new" className={cn(buttonVariants())}>
          เพิ่มปีการศึกษา
        </Link>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <YearTable years={years} />
      </CardContent>
    </Card>
  );
}

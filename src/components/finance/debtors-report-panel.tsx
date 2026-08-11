"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useAuth, useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchClassroomDebtors } from "@/lib/queries/reports";
import { fetchGradeLevels, fetchClassroomsBySemester } from "@/lib/queries/classrooms";
import { splitDebtorTotals } from "@/lib/reports/debtors";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht } from "@/lib/format";
import { ReportToolbar } from "@/components/finance/report-toolbar";
import { ReportLetterhead } from "@/components/finance/report-letterhead";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

const STATUS_LABELS = {
  enrolled: "กำลังเรียน",
  transferred: "ย้ายออก",
  withdrawn: "ลาออก",
} as const;

const STATUS_BADGE_CLASSES = {
  enrolled: "border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  transferred: "border-transparent bg-amber-50 text-amber-700 hover:bg-amber-50",
  withdrawn: "border-transparent bg-red-50 text-red-700 hover:bg-red-50",
} as const;

export function DebtorsReportPanel() {
  useRequireRole(["admin", "finance", "teacher"]);

  const { profile } = useAuth();
  const { ctx } = useSemesterContext();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const gradeParam = searchParams.get("grade") ?? "all";
  const classroomParam = searchParams.get("classroom") ?? "all";
  const teacherProfileId = profile?.role === "teacher" ? profile.id : undefined;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["classroom-debtors", ctx?.semesterId, gradeParam, classroomParam, teacherProfileId],
    queryFn: () =>
      fetchClassroomDebtors({
        semesterId: ctx!.semesterId,
        gradeLevelId: gradeParam !== "all" ? gradeParam : undefined,
        classroomId: classroomParam !== "all" ? classroomParam : undefined,
        teacherProfileId,
      }),
    enabled: !!ctx,
  });

  const { data: grades = [] } = useQuery({
    queryKey: ["grade-levels", ctx?.semesterId],
    queryFn: () => fetchGradeLevels(ctx!.semesterId),
    enabled: !!ctx,
  });

  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms", ctx?.semesterId],
    queryFn: () => fetchClassroomsBySemester(ctx!.semesterId),
    enabled: !!ctx,
  });

  const pushParams = useCallback(
    (next: { grade?: string; classroom?: string }) => {
      const query = new URLSearchParams(window.location.search);
      const grade = next.grade ?? gradeParam;
      const classroom = next.classroom ?? classroomParam;

      if (grade !== "all") query.set("grade", grade);
      else query.delete("grade");
      if (classroom !== "all") query.set("classroom", classroom);
      else query.delete("classroom");

      router.push(`${pathname}?${query.toString()}`);
    },
    [gradeParam, classroomParam, pathname, router],
  );

  const gradeItems = [
    { value: "all", label: "ทุกชั้น" },
    ...grades.map((g) => ({ value: g.id, label: g.name })),
  ];

  const classroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => gradeParam === "all" || c.grade_level_id === gradeParam)
      .map((c) => ({
        value: c.id,
        label: `${grades.find((g) => g.id === c.grade_level_id)?.name ?? ""}/${c.name}`,
      })),
  ];

  const totals = splitDebtorTotals(rows);
  const roomLabel = rows.length > 0 ? rows[0].roomLabel : null;
  const singleRoom = roomLabel !== null && rows.every((r) => r.roomLabel === roomLabel);

  return (
    <>
      <AppHeader title="รายชื่อลูกหนี้รายห้อง" basePath="/reports/debtors" />
      <style>{"@media print { @page { size: A4 portrait; margin: 10mm; } }"}</style>
      <main className="p-4 lg:p-6 print:p-0">
        <ReportLetterhead
          title="รายงานรายชื่อลูกหนี้รายห้อง"
          yearName={ctx?.academicYearName}
          semesterNumber={ctx?.semesterNumber}
          subtitle={
            singleRoom ? `ระดับชั้น ${roomLabel} · ยอดค้างสะสมทุกปีการศึกษา` : "ยอดค้างสะสมทุกปีการศึกษา"
          }
        />
        <Card className="border-border shadow-sm print:border-none print:shadow-none">
          <CardContent className="space-y-4 print:p-0 print:text-xs">
            <div className="report-toolbar flex flex-wrap items-center gap-2">
              <Select
                value={gradeParam}
                onValueChange={(v) => pushParams({ grade: v ?? "all", classroom: "all" })}
                items={gradeItems}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="ชั้น" />
                </SelectTrigger>
                <SelectContent>
                  {gradeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={classroomParam}
                onValueChange={(v) => pushParams({ classroom: v ?? "all" })}
                items={classroomItems}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="ห้อง" />
                </SelectTrigger>
                <SelectContent>
                  {classroomItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground print:hidden">
                ยอดค้างรวมทุกใบแจ้งหนี้ทุกปีการศึกษาของนักเรียนแต่ละคน
              </p>
              <div className="ml-auto">
                <ReportToolbar />
              </div>
            </div>

            {isLoading ? (
              <TableSkeleton rows={8} />
            ) : rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">ไม่พบนักเรียนในห้องที่เลือก</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">ลำดับที่</TableHead>
                    <TableHead>เลขประจำตัว</TableHead>
                    <TableHead>ชื่อ-สกุล</TableHead>
                    {singleRoom ? null : <TableHead>ห้อง</TableHead>}
                    <TableHead>ปีที่เข้าเรียน</TableHead>
                    <TableHead className="text-right">ยอดเต็ม</TableHead>
                    <TableHead className="text-right">ชำระแล้ว</TableHead>
                    <TableHead className="text-right">ค้างชำระ</TableHead>
                    <TableHead>สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={row.studentId}>
                      <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                      <TableCell>{row.studentName}</TableCell>
                      {singleRoom ? null : <TableCell>{row.roomLabel}</TableCell>}
                      <TableCell className="tabular-nums">{row.firstTermLabel}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(row.totalAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(row.paidAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatBaht(row.outstanding)}
                      </TableCell>
                      <TableCell>
                        {row.status === "enrolled" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Badge variant="outline" className={STATUS_BADGE_CLASSES[row.status]}>
                            {STATUS_LABELS[row.status]}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-medium">
                    <TableCell colSpan={singleRoom ? 5 : 6}>ยอดรวมเฉพาะที่เรียนอยู่</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(totals.enrolled.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(totals.enrolled.paidAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(totals.enrolled.outstanding)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow className="font-medium">
                    <TableCell colSpan={singleRoom ? 5 : 6}>ยอดรวมเฉพาะที่ออกไปแล้ว</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(totals.departed.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(totals.departed.paidAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(totals.departed.outstanding)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow className="border-t font-semibold">
                    <TableCell colSpan={singleRoom ? 5 : 6}>รวมเป็นเงิน</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(totals.all.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(totals.all.paidAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(totals.all.outstanding)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

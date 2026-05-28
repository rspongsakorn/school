"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useAuth, useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchOutstandingReport } from "@/lib/queries/reports";
import { fetchGradeLevels, fetchClassroomsBySemester } from "@/lib/queries/classrooms";
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
import { INVOICE_STATUS_LABELS } from "@/lib/finance/constants";

const STATUS_ITEMS = [
  { value: "all", label: "ค้างทั้งหมด" },
  { value: "unpaid", label: "ค้างชำระ" },
  { value: "partial", label: "ชำระบางส่วน" },
];

export function OutstandingReportPanel() {
  useRequireRole(["admin", "finance", "teacher"]);

  const { profile } = useAuth();
  const { ctx } = useSemesterContext();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const gradeParam = searchParams.get("grade") ?? "all";
  const classroomParam = searchParams.get("classroom") ?? "all";
  const rawStatus = searchParams.get("status");
  const statusParam =
    rawStatus === "unpaid" || rawStatus === "partial" ? rawStatus : ("all" as const);

  const teacherProfileId = profile?.role === "teacher" ? profile.id : undefined;

  const { data: rows = [], isLoading: rowsLoading } = useQuery({
    queryKey: [
      "outstanding-report",
      ctx?.semesterId,
      ctx?.academicYearId,
      gradeParam,
      classroomParam,
      statusParam,
      teacherProfileId,
    ],
    queryFn: () =>
      fetchOutstandingReport({
        semesterId: ctx!.semesterId,
        academicYearId: ctx!.academicYearId,
        gradeLevelId: gradeParam !== "all" ? gradeParam : undefined,
        classroomId: classroomParam !== "all" ? classroomParam : undefined,
        status: statusParam,
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

  const params = { grade: gradeParam, classroom: classroomParam, status: statusParam };

  const pushParams = useCallback(
    (next: Partial<typeof params>) => {
      const query = new URLSearchParams(window.location.search);
      const grade = next.grade ?? params.grade;
      const classroom = next.classroom ?? params.classroom;
      const status = next.status ?? params.status;

      if (grade !== "all") query.set("grade", grade);
      else query.delete("grade");
      if (classroom !== "all") query.set("classroom", classroom);
      else query.delete("classroom");
      if (status !== "all") query.set("status", status);
      else query.delete("status");

      router.push(`${pathname}?${query.toString()}`);
    },
    [params, pathname, router],
  );

  const gradeItems = [
    { value: "all", label: "ทุกชั้น" },
    ...grades.map((g) => ({ value: g.id, label: g.name })),
  ];

  const classroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => params.grade === "all" || c.grade_level_id === params.grade)
      .map((c) => ({ value: c.id, label: `${grades.find((g) => g.id === c.grade_level_id)?.name ?? ""}/${c.name}` })),
  ];

  return (
    <>
      <AppHeader title="รายงานค้างชำระ" basePath="/reports/outstanding" />
      <main className="p-4 lg:p-6">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select
              value={params.grade}
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
              value={params.classroom}
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
            <Select
              value={params.status}
              onValueChange={(v) => pushParams({ status: v ?? "all" })}
              items={STATUS_ITEMS}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="สถานะ" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mobile stacked cards */}
          {rowsLoading ? (
            <div className="sm:hidden h-40 animate-pulse rounded-lg bg-muted" />
          ) : rows.length === 0 ? (
            <p className="sm:hidden py-6 text-center text-sm text-muted-foreground">
              ไม่พบรายการค้างชำระ
            </p>
          ) : (
            <div className="sm:hidden space-y-2">
              {rows.map((row) => (
                <div key={row.studentId} className="rounded-lg border border-border px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.studentName}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {row.studentCode} · {row.gradeClassroom}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-semibold tabular-nums text-amber-700">
                        ค้าง {formatBaht(row.outstanding)}
                      </span>
                      <Badge variant="outline">{INVOICE_STATUS_LABELS[row.status]}</Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                    <span>ต้องชำระ <span className="tabular-nums text-foreground">{formatBaht(row.totalAmount)}</span></span>
                    <span>ชำระแล้ว <span className="tabular-nums text-foreground">{formatBaht(row.paidAmount)}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อ-นามสกุล</TableHead>
                  <TableHead>ชั้น/ห้อง</TableHead>
                  <TableHead className="text-right">ค่าใช้จ่าย</TableHead>
                  <TableHead className="text-right">ส่วนลด</TableHead>
                  <TableHead className="text-right">ต้องชำระ</TableHead>
                  <TableHead className="text-right">ชำระแล้ว</TableHead>
                  <TableHead className="text-right">ค้าง</TableHead>
                  <TableHead>สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                      กำลังโหลด...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                      ไม่พบรายการค้างชำระ
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                      <TableCell>{row.studentName}</TableCell>
                      <TableCell>{row.gradeClassroom}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(row.subtotal)}</TableCell>
                      <TableCell className="text-right">{row.discountLabel}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBaht(row.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBaht(row.paidAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatBaht(row.outstanding)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{INVOICE_STATUS_LABELS[row.status]}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </>
  );
}

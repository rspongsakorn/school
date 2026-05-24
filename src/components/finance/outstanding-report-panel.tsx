"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import type { OutstandingReportRow } from "@/lib/data/reports";
import type { GradeLevelRow } from "@/lib/data/grade-levels";
import type { ClassroomWithGradeRow } from "@/lib/data/classrooms";

const STATUS_ITEMS = [
  { value: "all", label: "ค้างทั้งหมด" },
  { value: "unpaid", label: "ค้างชำระ" },
  { value: "partial", label: "ชำระบางส่วน" },
];

type OutstandingReportPanelProps = {
  rows: OutstandingReportRow[];
  grades: GradeLevelRow[];
  classrooms: ClassroomWithGradeRow[];
  params: { grade: string; classroom: string; status: string };
};

export function OutstandingReportPanel({
  rows,
  grades,
  classrooms,
  params,
}: OutstandingReportPanelProps) {
  const router = useRouter();
  const pathname = usePathname();

  const gradeItems = [
    { value: "all", label: "ทุกชั้น" },
    ...grades.map((g) => ({ value: g.id, label: g.name })),
  ];

  const classroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => params.grade === "all" || c.grade_level_id === params.grade)
      .map((c) => ({ value: c.id, label: `${c.grade_name}/${c.name}` })),
  ];

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

  return (
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
          {rows.length === 0 ? (
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
  );
}

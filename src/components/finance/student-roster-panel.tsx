"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useAuth, useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchStudentRoster } from "@/lib/queries/reports";
import { fetchGradeLevels, fetchClassroomsBySemester } from "@/lib/queries/classrooms";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ReportToolbar } from "@/components/finance/report-toolbar";
import { ReportLetterhead } from "@/components/finance/report-letterhead";
import { TableSkeleton } from "@/components/ui/skeleton";
import { formatBaht } from "@/lib/format";
import { INVOICE_STATUS_LABELS } from "@/lib/finance/constants";
import { Card, CardContent } from "@/components/ui/card";

const STATUS_ITEMS = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "unpaid", label: "ค้างชำระ" },
  { value: "partial", label: "ชำระบางส่วน" },
  { value: "paid", label: "ชำระครบ" },
];

export function StudentRosterPanel() {
  useRequireRole(["admin", "finance", "teacher"]);
  const { profile } = useAuth();
  const { ctx } = useSemesterContext();
  const teacherProfileId = profile?.role === "teacher" ? profile.id : undefined;

  const [grade, setGrade] = useState("all");
  const [classroom, setClassroom] = useState("all");
  const [status, setStatus] = useState<"all" | "unpaid" | "partial" | "paid">("all");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["student-roster", ctx?.semesterId, ctx?.academicYearId, grade, classroom, status, search, teacherProfileId],
    queryFn: () =>
      fetchStudentRoster({
        semesterId: ctx!.semesterId,
        academicYearId: ctx!.academicYearId,
        gradeLevelId: grade !== "all" ? grade : undefined,
        classroomId: classroom !== "all" ? classroom : undefined,
        status,
        query: search,
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

  const gradeItems = [{ value: "all", label: "ทุกชั้น" }, ...grades.map((g) => ({ value: g.id, label: g.name }))];
  const classroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => grade === "all" || c.grade_level_id === grade)
      .map((c) => ({ value: c.id, label: `${grades.find((g) => g.id === c.grade_level_id)?.name ?? ""}/${c.name}` })),
  ];

  return (
    <>
      <AppHeader title="รายงานรายบุคคล" basePath="/reports/students" />
      <main className="p-4 lg:p-6">
        <ReportLetterhead title="รายงานสรุปรายบุคคล" yearName={ctx?.academicYearName} semesterNumber={ctx?.semesterNumber} />
        <Card className="border-border shadow-sm">
        <CardContent className="space-y-4">
          <div className="report-toolbar flex flex-wrap items-center gap-2">
            <Select value={grade} onValueChange={(v) => { setGrade(v ?? "all"); setClassroom("all"); }} items={gradeItems}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="ชั้น" /></SelectTrigger>
              <SelectContent>{gradeItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={classroom} onValueChange={(v) => setClassroom(v ?? "all")} items={classroomItems}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="ห้อง" /></SelectTrigger>
              <SelectContent>{classroomItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus((v ?? "all") as typeof status)} items={STATUS_ITEMS}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="สถานะ" /></SelectTrigger>
              <SelectContent>{STATUS_ITEMS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="ค้นหาชื่อ/รหัส" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[200px]" />
            <div className="ml-auto"><ReportToolbar /></div>
          </div>

          {isLoading ? (
            <TableSkeleton rows={8} />
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ไม่พบนักเรียน</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อ-นามสกุล</TableHead>
                  <TableHead>ชั้น/ห้อง</TableHead>
                  <TableHead className="text-right">ต้องชำระ</TableHead>
                  <TableHead className="text-right">ชำระแล้ว</TableHead>
                  <TableHead className="text-right">ค้าง</TableHead>
                  <TableHead>สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.studentId} className="cursor-pointer">
                    <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                    <TableCell>
                      <Link href={`/reports/students/${row.studentId}`} className="hover:underline">
                        {row.studentName}
                      </Link>
                    </TableCell>
                    <TableCell>{row.gradeClassroom}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(row.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(row.paidAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatBaht(row.outstanding)}</TableCell>
                    <TableCell><Badge variant="outline">{INVOICE_STATUS_LABELS[row.status]}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        </Card>
      </main>
    </>
  );
}

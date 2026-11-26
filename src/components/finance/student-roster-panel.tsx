"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useAuth, useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { fetchOutstandingReport } from "@/lib/queries/reports";
import { buildStudentRoster } from "@/lib/reports/roster";
import { knownOr, parseEnumParam, statementHref } from "@/lib/reports/url-filters";
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

// The student's combined status, judged after their invoices are collapsed.
// Same words as the outstanding report's filter: ยังไม่ชำระ is "paid nothing",
// so a student who paid tuition and still owes a fee is under ชำระบางส่วน —
// and both are under ยังค้างชำระ.
const STATUS_ITEMS = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "outstanding", label: "ยังค้างชำระ" },
  { value: "unpaid", label: "ยังไม่ชำระ" },
  { value: "partial", label: "ชำระบางส่วน" },
  { value: "paid", label: "ชำระแล้ว" },
];

export function StudentRosterPanel() {
  useRequireRole(["admin", "finance", "teacher"]);
  const { profile } = useAuth();
  const { ctx } = useSemesterContext();
  const teacherProfileId = profile?.role === "teacher" ? profile.id : undefined;

  const searchParams = useSearchParams();
  const setFilters = useUrlFilters();
  const { data: grades = [], isSuccess: gradesLoaded } = useQuery({
    queryKey: ["grade-levels", ctx?.semesterId],
    queryFn: () => fetchGradeLevels(ctx!.semesterId),
    enabled: !!ctx,
  });
  const { data: classrooms = [], isSuccess: classroomsLoaded } = useQuery({
    queryKey: ["classrooms", ctx?.semesterId],
    queryFn: () => fetchClassroomsBySemester(ctx!.semesterId),
    enabled: !!ctx,
  });
  // An id from another term (an old link, or a term changed elsewhere) would
  // filter the roster down to nobody; read it as "all" once the lists are in.
  const grade = knownOr(
    searchParams.get("grade") ?? "all",
    grades.map((g) => g.id),
    gradesLoaded,
  );
  const classroom = knownOr(
    searchParams.get("classroom") ?? "all",
    classrooms.map((c) => c.id),
    classroomsLoaded,
  );
  const status = parseEnumParam(
    searchParams.get("status"),
    ["all", "outstanding", "unpaid", "partial", "paid"] as const,
    "all",
  );
  const query = searchParams.get("q") ?? "";
  const defaults = { grade: "all", classroom: "all", status: "all", q: "" };

  // What is typed shows at once; the URL follows 300 ms after typing stops,
  // replacing the entry so a search is one step of Back, not one per key.
  const [searchText, setSearchText] = useState(query);
  // Follow the URL when q changes from outside (Back, the sidebar link): the
  // box must say what the list is filtered by. Comparing trimmed text keeps
  // the round trip of our own debounced write from eating a trailing space.
  // Changing searchText also re-runs the effect below, whose cleanup drops a
  // still-pending write that would otherwise put the old q back.
  const [seenQuery, setSeenQuery] = useState(query);
  if (query !== seenQuery) {
    setSeenQuery(query);
    if (query !== searchText.trim()) setSearchText(query);
  }
  useEffect(() => {
    if (searchText === query) return;
    const t = setTimeout(() => setFilters({ q: searchText.trim() }, defaults, { replace: true }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the text drives this
  }, [searchText]);

  // Status and search filter the loaded rows; only the term and room refetch.
  const { data: invoiceRows = [], isPending } = useQuery({
    queryKey: ["student-roster", ctx?.semesterId, ctx?.academicYearId, grade, classroom, teacherProfileId],
    queryFn: () =>
      fetchOutstandingReport({
        semesterId: ctx!.semesterId,
        academicYearId: ctx!.academicYearId,
        gradeLevelId: grade !== "all" ? grade : undefined,
        classroomId: classroom !== "all" ? classroom : undefined,
        status: "all",
        variant: "all",
        includeAllStatuses: true,
        teacherProfileId,
      }),
    // Wait for the term's grade and room lists before filtering on an id from
    // the URL, or a stale one flashes "ไม่พบนักเรียน" before knownOr resets it.
    enabled:
      !!ctx &&
      (!searchParams.get("grade") || gradesLoaded) &&
      (!searchParams.get("classroom") || classroomsLoaded),
  });
  const rows = buildStudentRoster(invoiceRows, { status, query });
  const rosterQuery = searchParams.toString();

  const gradeItems = [{ value: "all", label: "ทุกชั้น" }, ...grades.map((g) => ({ value: g.id, label: g.name }))];
  const classroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => grade === "all" || c.grade_level_id === grade)
      .map((c) => ({ value: c.id, label: `${grades.find((g) => g.id === c.grade_level_id)?.name ?? ""}/${c.name}` })),
  ];

  return (
    <>
      <AppHeader title="รายงานรายบุคคล" basePath="/reports/students" clearGradeClassroomOnChange />
      <main className="p-4 lg:p-6">
        <ReportLetterhead title="รายงานสรุปรายบุคคล" yearName={ctx?.academicYearName} semesterNumber={ctx?.semesterNumber} />
        <Card className="border-border shadow-sm">
        <CardContent className="space-y-4">
          <div className="report-toolbar flex flex-wrap items-center gap-2">
            <Select value={grade} onValueChange={(v) => setFilters({ grade: v ?? "all", classroom: "all" }, defaults)} items={gradeItems}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="ชั้น" /></SelectTrigger>
              <SelectContent>{gradeItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={classroom} onValueChange={(v) => setFilters({ classroom: v ?? "all" }, defaults)} items={classroomItems}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="ห้อง" /></SelectTrigger>
              <SelectContent>{classroomItems.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setFilters({ status: v ?? "all" }, defaults)} items={STATUS_ITEMS}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="สถานะ" /></SelectTrigger>
              <SelectContent>{STATUS_ITEMS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="ค้นหาชื่อ/รหัส" value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-[200px]" />
            <div className="ml-auto"><ReportToolbar /></div>
          </div>

          {isPending ? (
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
                      <Link href={statementHref(row.studentId, rosterQuery)} className="hover:underline">
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

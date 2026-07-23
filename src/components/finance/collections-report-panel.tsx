"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useAuth, useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import {
  fetchCollectionsByGrade,
  fetchCollectionsByClassroom,
  fetchCollectionsSummary,
} from "@/lib/queries/reports";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
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

const LEVEL_ITEMS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "grade", label: "ตามชั้น" },
  { value: "classroom", label: "ตามห้อง" },
];

export function CollectionsReportPanel() {
  useRequireRole(["admin", "finance", "teacher"]);

  const { profile } = useAuth();
  const { ctx } = useSemesterContext();

  const teacherProfileId = profile?.role === "teacher" ? profile.id : undefined;

  const [level, setLevel] = useState<"all" | "grade" | "classroom">("grade");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [
      "collections-report",
      ctx?.semesterId,
      ctx?.academicYearId,
      teacherProfileId,
    ],
    queryFn: () =>
      fetchCollectionsByGrade(ctx!.semesterId, ctx!.academicYearId, teacherProfileId),
    enabled: !!ctx && level === "grade",
  });

  const { data: classroomRows = [] } = useQuery({
    queryKey: [
      "collections-by-classroom",
      ctx?.semesterId,
      ctx?.academicYearId,
      teacherProfileId,
    ],
    queryFn: () =>
      fetchCollectionsByClassroom(ctx!.semesterId, ctx!.academicYearId, teacherProfileId),
    enabled: !!ctx && level === "classroom",
  });

  const { data: summary } = useQuery({
    queryKey: [
      "collections-summary",
      ctx?.semesterId,
      ctx?.academicYearId,
      teacherProfileId,
    ],
    queryFn: () =>
      fetchCollectionsSummary(ctx!.semesterId, ctx!.academicYearId, teacherProfileId),
    enabled: !!ctx && level === "all",
  });

  return (
    <>
      <AppHeader title="รายงานการจัดเก็บ" basePath="/reports/collections" />
      <main className="p-4 lg:p-6">
        <ReportLetterhead
          title="สถิติการเก็บเงิน"
          yearName={ctx?.academicYearName}
          semesterNumber={ctx?.semesterNumber}
        />
        <Card className="border-border shadow-sm">
        <CardContent className="space-y-4">
          <div className="report-toolbar flex flex-wrap items-center gap-2">
            <Select
              value={level}
              onValueChange={(v) => setLevel((v ?? "grade") as typeof level)}
              items={LEVEL_ITEMS}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="ระดับ" />
              </SelectTrigger>
              <SelectContent>
                {LEVEL_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ReportToolbar />
          </div>

          {level === "all" ? (
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">นักเรียนทั้งหมด</p>
                  <p className="text-2xl font-semibold tabular-nums">{summary?.studentCount ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">ยอดที่ต้องเก็บ</p>
                  <p className="text-2xl font-semibold tabular-nums">{formatBaht(summary?.totalDue ?? 0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">เก็บได้</p>
                  <p className="text-2xl font-semibold tabular-nums">{formatBaht(summary?.totalPaid ?? 0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">อัตราเก็บได้</p>
                  <p className="text-2xl font-semibold tabular-nums">{summary?.ratePercent ?? 0}%</p>
                </CardContent>
              </Card>
            </div>
          ) : level === "classroom" ? (
            <>
              {/* Mobile stacked cards */}
              <div className="sm:hidden space-y-2">
                {classroomRows.map((row) => (
                  <div key={row.classroomLabel} className="rounded-lg border border-border px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{row.classroomLabel}</span>
                      <span className="text-sm text-muted-foreground">{row.studentCount} คน</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">ต้องเก็บ</p>
                        <p className="tabular-nums">{formatBaht(row.totalDue)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">เก็บได้</p>
                        <p className="tabular-nums">{formatBaht(row.totalPaid)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">อัตรา</p>
                        <p className="font-semibold tabular-nums">{row.ratePercent}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ห้อง</TableHead>
                      <TableHead className="text-right">จำนวนนักเรียน</TableHead>
                      <TableHead className="text-right">ยอดที่ต้องเก็บ</TableHead>
                      <TableHead className="text-right">ยอดที่เก็บได้</TableHead>
                      <TableHead className="text-right">อัตรา (%)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classroomRows.map((row) => (
                      <TableRow key={row.classroomLabel}>
                        <TableCell className="font-medium">{row.classroomLabel}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.studentCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBaht(row.totalDue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBaht(row.totalPaid)}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.ratePercent}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูล</p>
          ) : (
            <>
              {/* Mobile stacked cards */}
              <div className="sm:hidden space-y-2">
                {rows.map((row) => (
                  <div key={row.gradeName} className="rounded-lg border border-border px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{row.gradeName}</span>
                      <span className="text-sm text-muted-foreground">{row.studentCount} คน</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">ต้องเก็บ</p>
                        <p className="tabular-nums">{formatBaht(row.totalDue)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">เก็บได้</p>
                        <p className="tabular-nums">{formatBaht(row.totalPaid)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">อัตรา</p>
                        <p className="font-semibold tabular-nums">{row.ratePercent}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ชั้น</TableHead>
                      <TableHead className="text-right">จำนวนนักเรียน</TableHead>
                      <TableHead className="text-right">ยอดที่ต้องเก็บ</TableHead>
                      <TableHead className="text-right">ยอดที่เก็บได้</TableHead>
                      <TableHead className="text-right">อัตรา (%)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.gradeName}>
                        <TableCell className="font-medium">{row.gradeName}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.studentCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBaht(row.totalDue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBaht(row.totalPaid)}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.ratePercent}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
        </Card>
      </main>
    </>
  );
}

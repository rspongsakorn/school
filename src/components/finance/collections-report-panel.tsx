"use client";

import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useAuth, useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchCollectionsByGrade } from "@/lib/queries/reports";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht } from "@/lib/format";

export function CollectionsReportPanel() {
  useRequireRole(["admin", "finance", "teacher"]);

  const { profile } = useAuth();
  const { ctx } = useSemesterContext();

  const teacherProfileId = profile?.role === "teacher" ? profile.id : undefined;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [
      "collections-report",
      ctx?.semesterId,
      ctx?.academicYearId,
      teacherProfileId,
    ],
    queryFn: () =>
      fetchCollectionsByGrade(ctx!.semesterId, ctx!.academicYearId, teacherProfileId),
    enabled: !!ctx,
  });

  return (
    <>
      <AppHeader title="รายงานการจัดเก็บ" basePath="/reports/collections" />
      <main className="p-4 lg:p-6">
        {isLoading ? (
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
      </main>
    </>
  );
}

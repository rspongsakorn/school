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
      <main className="p-6">
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
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  กำลังโหลด...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  ไม่มีข้อมูล
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.gradeName}>
                  <TableCell className="font-medium">{row.gradeName}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.studentCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBaht(row.totalDue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBaht(row.totalPaid)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.ratePercent}%</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </main>
    </>
  );
}

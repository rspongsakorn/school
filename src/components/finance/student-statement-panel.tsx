"use client";

import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchStudentStatement } from "@/lib/queries/reports";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ReportToolbar } from "@/components/finance/report-toolbar";
import { ReportLetterhead } from "@/components/finance/report-letterhead";
import { formatBaht } from "@/lib/format";

export function StudentStatementPanel({ studentId }: { studentId: string }) {
  useRequireRole(["admin", "finance", "teacher"]);
  const { ctx } = useSemesterContext();

  const { data: s, isLoading } = useQuery({
    queryKey: ["student-statement", studentId, ctx?.semesterId, ctx?.academicYearId],
    queryFn: () => fetchStudentStatement(studentId, ctx!.semesterId, ctx!.academicYearId),
    enabled: !!ctx,
  });

  return (
    <>
      <AppHeader title="ใบแจ้งยอดรายบุคคล" basePath="/reports/students" />
      <main className="p-4 lg:p-6">
        <ReportLetterhead
          title="ใบแจ้งยอดค่าใช้จ่ายนักเรียน"
          yearName={ctx?.academicYearName}
          semesterNumber={ctx?.semesterNumber}
          subtitle={s ? `${s.studentName} (${s.studentCode}) · ${s.gradeClassroom}` : undefined}
        />
        <div className="report-toolbar mb-4 flex justify-end"><ReportToolbar /></div>

        {isLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        ) : !s ? (
          <p className="py-6 text-center text-sm text-muted-foreground">ไม่พบข้อมูลนักเรียน</p>
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg border border-border p-4 print:border-black">
              <p className="text-lg font-semibold">{s.studentName}</p>
              <p className="text-sm text-muted-foreground">{s.studentCode} · {s.gradeClassroom}</p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">ค่าใช้จ่าย</h3>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>รายการ</TableHead><TableHead className="text-right">จำนวนเงิน</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {s.lines.map((l, i) => (
                    <TableRow key={i}><TableCell>{l.description}</TableCell><TableCell className="text-right tabular-nums">{formatBaht(l.amount)}</TableCell></TableRow>
                  ))}
                  <TableRow className="border-t-2 font-semibold"><TableCell>รวมต้องชำระ</TableCell><TableCell className="text-right tabular-nums">{formatBaht(s.totalDue)}</TableCell></TableRow>
                </TableBody>
              </Table>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">ประวัติการชำระ</h3>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>วันที่</TableHead><TableHead>เลขที่ใบเสร็จ</TableHead><TableHead>วิธี</TableHead><TableHead className="text-right">ยอด</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {s.payments.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-4 text-center text-muted-foreground">ยังไม่มีการชำระ</TableCell></TableRow>
                  ) : (
                    s.payments.map((p, i) => (
                      <TableRow key={i} className={p.status === "voided" ? "text-red-600 line-through" : ""}>
                        <TableCell>{p.dateLabel}</TableCell>
                        <TableCell>
                          {p.receiptNumber}
                          {p.status === "voided" ? <Badge variant="outline" className="ml-2 text-xs">ยกเลิก</Badge> : null}
                        </TableCell>
                        <TableCell>{p.method === "cash" ? "เงินสด" : "เงินโอน"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBaht(p.amount)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between"><span>รวมต้องชำระ</span><span className="tabular-nums">{formatBaht(s.totalDue)}</span></div>
                <div className="flex justify-between"><span>ชำระแล้ว</span><span className="tabular-nums">{formatBaht(s.totalPaid)}</span></div>
                <div className="flex justify-between border-t pt-1 font-semibold"><span>คงค้าง</span><span className="tabular-nums">{formatBaht(s.outstanding)}</span></div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

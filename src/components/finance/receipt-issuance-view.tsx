"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht, formatThaiDate } from "@/lib/format";
import { flattenReceiptsForIssuanceReport, type DailyDetailReceipt } from "@/lib/queries/reports";
import { summarizeByMethod } from "@/lib/reports/daily";

type ReceiptIssuanceViewProps = {
  receiptsByDate: Record<string, DailyDetailReceipt[]>;
  yearSemesterLabel: string;
};

export function ReceiptIssuanceView({ receiptsByDate, yearSemesterLabel }: ReceiptIssuanceViewProps) {
  const receipts = flattenReceiptsForIssuanceReport(receiptsByDate);
  const byMethod = summarizeByMethod(receipts);
  const total = byMethod.total;

  if (receipts.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงที่เลือก</p>;
  }

  return (
    <>
      <style>{"@media print { @page { size: A4 landscape; } }"}</style>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขที่ใบเสร็จ</TableHead>
            <TableHead>วันที่</TableHead>
            <TableHead>ปีการศึกษา</TableHead>
            <TableHead>รหัสนักเรียน</TableHead>
            <TableHead>ชื่อ</TableHead>
            <TableHead>ชั้น/ห้อง</TableHead>
            <TableHead className="text-right">จำนวนเงิน</TableHead>
            <TableHead>วิธีจ่าย</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>ทำรายการโดย</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {receipts.map((r) => (
            <TableRow key={r.paymentId}>
              <TableCell className="font-medium">{r.receiptNumber}</TableCell>
              <TableCell>
                {formatThaiDate(r.paidAt)} {r.timeLabel}
              </TableCell>
              <TableCell>{yearSemesterLabel}</TableCell>
              <TableCell>{r.studentCode}</TableCell>
              <TableCell>{r.studentName}</TableCell>
              <TableCell>{r.gradeClassroom}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBaht(r.amount)}</TableCell>
              <TableCell>{r.paymentMethod === "cash" ? "เงินสด" : "เงินโอน"}</TableCell>
              <TableCell>
                {r.status === "voided" ? (
                  <Badge variant="outline" className="text-xs text-red-600">ยกเลิก</Badge>
                ) : (
                  "ปกติ"
                )}
              </TableCell>
              <TableCell>{r.recordedByName}</TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 font-semibold">
            <TableCell colSpan={6}>รวมทั้งช่วง</TableCell>
            <TableCell className="text-right tabular-nums">{formatBaht(total)}</TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        </TableBody>
      </Table>
      <div className="break-inside-avoid pt-4">
        <h3 className="mb-2 text-sm font-semibold">สรุปยอดตามวิธีชำระ</h3>
        <table className="w-full max-w-md text-sm">
          <tbody>
            <tr className="border-b">
              <td className="py-1.5">เงินสด</td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">{byMethod.cashCount} รายการ</td>
              <td className="py-1.5 text-right tabular-nums">{formatBaht(byMethod.cashTotal)}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1.5">เงินโอน</td>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">{byMethod.transferCount} รายการ</td>
              <td className="py-1.5 text-right tabular-nums">{formatBaht(byMethod.transferTotal)}</td>
            </tr>
            <tr className="border-b-4 border-double font-semibold">
              <td className="py-1.5">รวมทั้งสิ้น</td>
              <td className="py-1.5 text-right tabular-nums">{byMethod.cashCount + byMethod.transferCount} รายการ</td>
              <td className="py-1.5 text-right tabular-nums">{formatBaht(byMethod.total)}</td>
            </tr>
          </tbody>
        </table>
        {byMethod.voidedCount > 0 ? (
          <p className="pt-2 text-xs text-muted-foreground">
            ใบเสร็จที่ยกเลิก {byMethod.voidedCount} รายการ ({formatBaht(byMethod.voidedAmount)}) ไม่นับรวมในยอดข้างต้น
          </p>
        ) : null}
      </div>
    </>
  );
}

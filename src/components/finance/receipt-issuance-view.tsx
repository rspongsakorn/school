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

type ReceiptIssuanceViewProps = {
  receiptsByDate: Record<string, DailyDetailReceipt[]>;
};

export function ReceiptIssuanceView({ receiptsByDate }: ReceiptIssuanceViewProps) {
  const receipts = flattenReceiptsForIssuanceReport(receiptsByDate);
  const total = receipts
    .filter((r) => r.status === "active")
    .reduce((sum, r) => sum + r.amount, 0);

  if (receipts.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงที่เลือก</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>เลขที่ใบเสร็จ</TableHead>
          <TableHead>วันที่</TableHead>
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
          <TableCell colSpan={5}>รวมทั้งช่วง</TableCell>
          <TableCell className="text-right tabular-nums">{formatBaht(total)}</TableCell>
          <TableCell colSpan={3} />
        </TableRow>
      </TableBody>
    </Table>
  );
}

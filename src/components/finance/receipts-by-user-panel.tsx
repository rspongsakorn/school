"use client";

import { Fragment, useState } from "react";
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
import type { DailyDetailReceipt } from "@/lib/queries/reports";
import type { UserRevenueRow } from "@/lib/reports/by-user";

type ReceiptsByUserPanelProps = {
  byUser: UserRevenueRow[];
  receiptsByUser: Record<string, DailyDetailReceipt[]>;
};

export function ReceiptsByUserPanel({ byUser, receiptsByUser }: ReceiptsByUserPanelProps) {
  const [openUser, setOpenUser] = useState<string | null>(null);

  const totals = byUser.reduce(
    (acc, r) => ({
      receiptCount: acc.receiptCount + r.receiptCount,
      cashTotal: acc.cashTotal + r.cashTotal,
      transferTotal: acc.transferTotal + r.transferTotal,
      total: acc.total + r.total,
    }),
    { receiptCount: 0, cashTotal: 0, transferTotal: 0, total: 0 },
  );

  if (byUser.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงที่เลือก</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ผู้ใช้งาน</TableHead>
          <TableHead className="text-right">จำนวนใบเสร็จ</TableHead>
          <TableHead className="text-right">เงินสด</TableHead>
          <TableHead className="text-right">เงินโอน</TableHead>
          <TableHead className="text-right">รวม</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {byUser.map((row) => (
          <Fragment key={row.profileId}>
            <TableRow
              className="cursor-pointer"
              onClick={() => setOpenUser(openUser === row.profileId ? null : row.profileId)}
            >
              <TableCell className="font-medium">
                {row.recordedByName}
                {row.voidedCount > 0 ? (
                  <Badge variant="outline" className="ml-2 text-xs">
                    ยกเลิก {row.voidedCount}
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.receiptCount}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBaht(row.cashTotal)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBaht(row.transferTotal)}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{formatBaht(row.total)}</TableCell>
            </TableRow>
            {openUser === row.profileId
              ? (receiptsByUser[row.profileId] ?? []).map((rec) => (
                  <TableRow key={rec.paymentId} className="bg-muted/40 text-sm">
                    <TableCell className="pl-8">
                      {formatThaiDate(rec.paidAt)} {rec.timeLabel} · {rec.receiptNumber}
                      {rec.status === "voided" ? (
                        <Badge variant="outline" className="ml-2 text-xs text-red-600">ยกเลิก</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell colSpan={2}>
                      {rec.studentName} ({rec.studentCode})
                    </TableCell>
                    <TableCell className="text-right">
                      {rec.paymentMethod === "cash" ? "เงินสด" : "เงินโอน"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(rec.amount)}</TableCell>
                  </TableRow>
                ))
              : null}
          </Fragment>
        ))}
        <TableRow className="border-t-2 font-semibold">
          <TableCell>รวมทั้งช่วง</TableCell>
          <TableCell className="text-right tabular-nums">{totals.receiptCount}</TableCell>
          <TableCell className="text-right tabular-nums">{formatBaht(totals.cashTotal)}</TableCell>
          <TableCell className="text-right tabular-nums">{formatBaht(totals.transferTotal)}</TableCell>
          <TableCell className="text-right tabular-nums">{formatBaht(totals.total)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

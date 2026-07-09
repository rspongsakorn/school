"use client";

import { formatBaht, formatThaiDate, bahtText } from "@/lib/format";
import type { DailyRemittanceItem } from "@/lib/queries/reports";

type DailyRemittanceSlipProps = {
  items: DailyRemittanceItem[];
  dateFrom: string;
  dateTo: string;
};

export function DailyRemittanceSlip({ items, dateFrom, dateTo }: DailyRemittanceSlipProps) {
  const totalReceipts = items.reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = 0; // always 0 — system has no expense-tracking data (see design doc)
  const netTotal = totalReceipts - totalExpenses;

  return (
    <div className="space-y-6 rounded-lg border p-6">
      <div className="text-center">
        <p className="text-base font-bold">ใบนำส่งเงินประจำวัน</p>
        <p className="text-sm text-muted-foreground">
          ประจำวัน {formatThaiDate(`${dateFrom}T00:00:00+07:00`)} ถึง {formatThaiDate(`${dateTo}T00:00:00+07:00`)}
        </p>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th className="w-16 py-1 text-left">ลำดับ</th>
            <th className="w-24 py-1 text-left">รหัสรายการ</th>
            <th className="py-1 text-left">รายการ</th>
            <th className="py-1 text-right">จำนวนเงิน (บาท)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.receiptTypeId}>
              <td className="py-1">{index + 1}</td>
              <td className="py-1">{item.code}</td>
              <td className="py-1">{item.name}</td>
              <td className="py-1 text-right tabular-nums">{formatBaht(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span>รวมรายรับ</span>
          <span className="tabular-nums">{formatBaht(totalReceipts)}</span>
        </div>
        <div className="flex justify-between">
          <span>รวมรายจ่าย</span>
          <span className="tabular-nums">{formatBaht(totalExpenses)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 font-semibold">
          <span>รวมเป็นเงิน</span>
          <span className="tabular-nums">{formatBaht(netTotal)}</span>
        </div>
      </div>

      <p className="border-y py-2 text-center font-medium">({bahtText(netTotal)})</p>

      <div className="grid grid-cols-2 gap-8 pt-12 text-center text-sm">
        <div>
          <p>ลงชื่อ ..................................................</p>
          <p className="mt-1 text-xs text-muted-foreground">ฝ่ายบัญชีและการเงิน</p>
        </div>
        <div>
          <p>ลงชื่อ ..................................................</p>
          <p className="mt-1 text-xs text-muted-foreground">หัวหน้าฝ่ายบัญชีและการเงิน</p>
        </div>
      </div>
    </div>
  );
}

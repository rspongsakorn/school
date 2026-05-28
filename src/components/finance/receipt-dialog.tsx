"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBaht } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/constants";

export type ReceiptSnapshot = {
  receiptNumber?: string;
  paidAt?: string;
  studentCode?: string;
  studentName?: string;
  gradeClassroom?: string;
  paymentMethod?: keyof typeof PAYMENT_METHOD_LABELS;
  transferReference?: string | null;
  amount?: number;
  allocations?: { invoiceName: string; amount: number }[];
  recordedBy?: string;
};

type ReceiptDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: ReceiptSnapshot | Record<string, unknown> | null;
};

export function ReceiptDialog({ open, onOpenChange, snapshot }: ReceiptDialogProps) {
  if (!snapshot) return null;

  const data = snapshot as ReceiptSnapshot;
  const paidAt = data.paidAt
    ? new Date(data.paidAt).toLocaleString("th-TH")
    : "—";

  function handlePrint() {
    window.print();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md print:shadow-none">
        <div id="receipt-print-area" className="space-y-4">
          <div className="flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="โรงเรียนบัวใหญ่วิทยา"
              width={64}
              height={64}
              className="h-16 w-16 rounded-full object-cover"
            />
            <p className="mt-2 text-base font-semibold">โรงเรียนบัวใหญ่วิทยา</p>
            <p className="text-xs text-muted-foreground">อ.บัวใหญ่ จ.นครราชสีมา</p>
            <DialogTitle className="mt-2">ใบเสร็จรับเงิน</DialogTitle>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">เลขที่</dt>
            <dd className="font-medium tabular-nums">{data.receiptNumber}</dd>
            <dt className="text-muted-foreground">วันที่</dt>
            <dd>{paidAt}</dd>
            <dt className="text-muted-foreground">นักเรียน</dt>
            <dd>
              {data.studentCode} {data.studentName}
            </dd>
            <dt className="text-muted-foreground">ชั้น/ห้อง</dt>
            <dd>{data.gradeClassroom}</dd>
            <dt className="text-muted-foreground">วิธีชำระ</dt>
            <dd>
              {data.paymentMethod
                ? PAYMENT_METHOD_LABELS[data.paymentMethod]
                : "—"}
            </dd>
            {data.transferReference ? (
              <>
                <dt className="text-muted-foreground">อ้างอิง</dt>
                <dd>{data.transferReference}</dd>
              </>
            ) : null}
          </dl>

          <div className="rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-2">รายการ</th>
                  <th className="p-2 text-right">จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {(data.allocations ?? []).map((line) => (
                  <tr key={line.invoiceName} className="border-b border-border last:border-0">
                    <td className="p-2">{line.invoiceName}</td>
                    <td className="p-2 text-right tabular-nums">{formatBaht(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="p-2 font-semibold">รวม</td>
                  <td className="p-2 text-right font-semibold tabular-nums">
                    {formatBaht(data.amount ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            ผู้รับเงิน: {data.recordedBy}
          </p>
        </div>

        <DialogFooter className="print:hidden">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          <Button type="button" onClick={handlePrint}>
            พิมพ์
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

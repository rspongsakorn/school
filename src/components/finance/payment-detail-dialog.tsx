"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBaht } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/constants";
import { fetchPaymentDetail } from "@/lib/queries/payments";
import type { PaymentListRow } from "@/lib/queries/payments";

export function PaymentDetailDialog({
  payment,
  onClose,
  onVoid,
}: {
  payment: PaymentListRow | null;
  onClose: () => void;
  onVoid: (payment: PaymentListRow) => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payment-detail", payment?.id],
    queryFn: () => fetchPaymentDetail(payment!.id),
    enabled: payment !== null,
  });

  return (
    <Dialog open={payment !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {payment ? (
          <>
            <DialogHeader>
              <DialogTitle>{payment.studentName}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                รหัส {payment.studentCode} · {payment.gradeClassroom}
                {data ? ` · ปีการศึกษา ${data.academicYearName} ภาคเรียนที่ ${data.semesterNumber}` : null}
              </p>
            </DialogHeader>

            <div className="flex justify-between border-y border-border py-2 text-sm text-muted-foreground">
              <span>เลขที่ {payment.receiptNumber}</span>
              <span>
                {payment.paidAtLabel} · {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
              </span>
            </div>

            {isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">กำลังโหลด...</p>
            ) : isError || !data ? (
              <div className="py-6 text-center">
                <p className="mb-2 text-sm text-muted-foreground">โหลดรายละเอียดไม่สำเร็จ</p>
                <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
                  ลองใหม่
                </Button>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                {data.lineItems.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-muted-foreground">{item.name}</span>
                    <span className="tabular-nums">{formatBaht(item.amount)}</span>
                  </div>
                ))}

                {data.discounts.length > 0 ? (
                  <>
                    <div className="flex justify-between border-t border-border pt-1">
                      <span className="text-muted-foreground">รวม</span>
                      <span className="tabular-nums">{formatBaht(data.subtotal)}</span>
                    </div>
                    {data.discounts.map((d, i) => (
                      <div key={i} className="flex justify-between text-destructive">
                        <span>หัก ส่วนลด ({d.name})</span>
                        <span className="tabular-nums">−{formatBaht(d.amount)}</span>
                      </div>
                    ))}
                  </>
                ) : null}

                <div className="flex items-baseline justify-between border-t border-border pt-2">
                  <span className="font-medium">รวมสุทธิ</span>
                  <span className="text-lg font-semibold tabular-nums">
                    {formatBaht(payment.amount)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                {data ? `ผู้รับเงิน: ${data.recordedBy}` : null}
              </span>
              <div className="flex gap-2">
                <a href={`/receipts/${payment.id}`} target="_blank" rel="noopener noreferrer">
                  <Button type="button" size="sm" variant="outline">
                    ใบเสร็จ
                  </Button>
                </a>
                {payment.status === "active" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => onVoid(payment)}
                  >
                    ยกเลิก
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

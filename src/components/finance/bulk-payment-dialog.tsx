"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  recordPaymentsBulk,
  type BulkPaymentFailure,
  type BulkPaymentSuccess,
} from "@/lib/actions/payments";
import {
  summarizeTargets,
  type BulkPaymentTargets,
} from "@/lib/finance/bulk-payment-selection";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/constants";
import { formatBaht } from "@/lib/format";
import { invalidateFinanceQueries } from "@/lib/queries/invalidate";

const METHOD_ITEMS = (
  Object.entries(PAYMENT_METHOD_LABELS) as [keyof typeof PAYMENT_METHOD_LABELS, string][]
).map(([value, label]) => ({ value, label }));

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: BulkPaymentTargets;
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  /** Called once the batch has been recorded, so the page can clear its selection. */
  onCompleted: () => void;
};

export function BulkPaymentDialog({
  open,
  onOpenChange,
  targets,
  academicYearId,
  academicYearName,
  semesterId,
  onCompleted,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [remark, setRemark] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{
    succeeded: BulkPaymentSuccess[];
    failed: BulkPaymentFailure[];
  } | null>(null);

  const { count, totalAmount } = summarizeTargets(targets.payable);

  // The dialog is controlled by the parent and keeps its own form state, so
  // each time it opens it must start from a clean form rather than the
  // previous batch's inputs or result.
  useEffect(() => {
    if (!open) return;
    setMethod("cash"); // eslint-disable-line react-hooks/set-state-in-effect
    setRemark("");
    setNote("");
    setResult(null);
    setConfirmOpen(false);
  }, [open]);

  function printBatch(paymentIds: string[]) {
    if (paymentIds.length === 0) return;
    const query = paymentIds.join(",");
    // Loads the receipts inside a hidden iframe; the page auto-prints itself
    // (?autoprint=1). Avoids the popup blocker.
    if (iframeRef.current) {
      iframeRef.current.src = `/receipts/batch?ids=${query}&autoprint=1`;
    } else {
      window.open(`/receipts/batch?ids=${query}`, "_blank", "noopener,noreferrer");
    }
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const res = await recordPaymentsBulk({
        invoiceIds: targets.payable.map((row) => row.id),
        academicYearId,
        academicYearName,
        semesterId,
        paymentMethod: method,
        remark: remark.trim() || undefined,
        note: note.trim() || undefined,
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      setResult({ succeeded: res.succeeded, failed: res.failed });

      if (res.succeeded.length > 0) {
        toast.success(`บันทึกการชำระแล้ว ${res.succeeded.length} ใบ`);
        printBatch(res.succeeded.map((row) => row.paymentId));
      }
      if (res.failed.length > 0) {
        toast.error(`ไม่สำเร็จ ${res.failed.length} ใบ`);
      }

      invalidateFinanceQueries(queryClient);
      router.refresh();
      onCompleted();
    } catch {
      // Each invoice commits in its own transaction, so a thrown error (a
      // dropped connection, or the request exceeding a platform timeout —
      // realistic here since a full batch can be up to 100 sequential RPCs)
      // may still have recorded some payments. Don't invite a blind retry.
      toast.error("บันทึกไม่สำเร็จ — กรุณาตรวจสอบรายการชำระก่อนทำซ้ำ");
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <iframe ref={iframeRef} className="hidden" title="receipts" />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>รับชำระหลายรายการ</DialogTitle>
            <DialogDescription>
              {result
                ? "สรุปผลการบันทึก"
                : `รับเต็มยอดค้างของแต่ละคน — ออกใบเสร็จแยกใบ ${count} ใบ`}
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="min-w-0 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  บันทึกแล้ว {result.succeeded.length} ใบ
                </p>
                <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ชื่อ</TableHead>
                        <TableHead>เลขที่ใบเสร็จ</TableHead>
                        <TableHead className="text-right">จำนวนเงิน</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.succeeded.map((row) => (
                        <TableRow key={row.paymentId}>
                          <TableCell>{row.studentName}</TableCell>
                          <TableCell className="tabular-nums">{row.receiptNumber}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatBaht(row.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* Outside the scroll box: this is the figure the cashier tallies
                    against the cash in hand, so it must never need scrolling to. */}
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 font-semibold">
                  <span>รวม {result.succeeded.length} ใบ</span>
                  <span className="tabular-nums">
                    {formatBaht(
                      Math.round(
                        result.succeeded.reduce((sum, row) => sum + row.amount, 0) * 100,
                      ) / 100,
                    )}
                  </span>
                </div>
              </div>

              {result.failed.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive">
                    ไม่สำเร็จ {result.failed.length} ใบ
                  </p>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-2">
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {result.failed.map((row) => (
                        <li key={row.invoiceId}>
                          {row.studentName} ({row.studentCode}) — {row.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button
                  type="button"
                  className="flex-1"
                  disabled={result.succeeded.length === 0}
                  onClick={() => printBatch(result.succeeded.map((row) => row.paymentId))}
                >
                  พิมพ์ใบเสร็จทั้งชุด
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => onOpenChange(false)}
                >
                  ปิด
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="min-w-0 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (count === 0) {
                  toast.error("ไม่มีรายการที่รับชำระได้");
                  return;
                }
                setConfirmOpen(true);
              }}
            >
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>รหัส</TableHead>
                      <TableHead>ชื่อ</TableHead>
                      <TableHead>ชั้น/ห้อง</TableHead>
                      <TableHead>ใบแจ้ง</TableHead>
                      <TableHead className="text-right">ยอดที่จะรับ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {targets.payable.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                        <TableCell>{row.studentName}</TableCell>
                        <TableCell>{row.gradeClassroom}</TableCell>
                        <TableCell className="max-w-[160px] truncate">{row.invoiceName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBaht(row.outstanding)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Kept out of the scroll box so the amount being committed to is
                  always on screen, however long the classroom list is. */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 font-semibold">
                <span>รวม {count} คน</span>
                <span className="tabular-nums">{formatBaht(totalAmount)}</span>
              </div>

              {targets.skipped.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    ข้าม {targets.skipped.length} รายการ
                  </p>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-2">
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {targets.skipped.map((row) => (
                        <li key={row.id}>
                          {row.studentName} — {row.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label>วิธีชำระ</Label>
                <Select
                  value={method}
                  onValueChange={(v) => setMethod(v as "cash" | "transfer")}
                  items={METHOD_ITEMS}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHOD_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bulk-remark">หมายเหตุ</Label>
                <Input
                  id="bulk-remark"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="แสดงในใบเสร็จทุกใบ เช่น รับผ่านครูประจำชั้น (ไม่บังคับ)"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bulk-note">หมายเหตุภายใน</Label>
                <Input
                  id="bulk-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ไม่แสดงในใบเสร็จ (ไม่บังคับ)"
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting || count === 0}>
                {submitting ? "กำลังบันทึก..." : `ยืนยัน ออกใบเสร็จ ${count} ใบ`}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการรับชำระ</AlertDialogTitle>
            <AlertDialogDescription>
              รับชำระ {count} คน รวม {formatBaht(totalAmount)} (
              {PAYMENT_METHOD_LABELS[method]}) — ระบบจะออกใบเสร็จแยกใบให้แต่ละคน
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remark.trim() ? (
            <div className="flex justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <span className="shrink-0 text-muted-foreground">หมายเหตุ</span>
              <span className="break-words">{remark.trim()}</span>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction autoFocus onClick={handleConfirm} disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { recordPayment } from "@/lib/actions/payments";
import { formatBaht } from "@/lib/format";
import { fetchInvoiceLines } from "@/lib/queries/invoices";
import type { InvoiceListRow } from "@/lib/queries/invoices";

const METHOD_ITEMS = [
  { value: "cash", label: "เงินสด" },
  { value: "transfer", label: "โอน" },
];

type Props = {
  invoice: InvoiceListRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InvoicePaymentDialog({ invoice, open, onOpenChange }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { ctx } = useSemesterContext();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [transferRef, setTransferRef] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: lines = [] } = useQuery({
    queryKey: ["invoice-lines", invoice?.id],
    queryFn: () => fetchInvoiceLines(invoice!.id),
    enabled: !!invoice?.id && open,
  });

  useEffect(() => {
    if (!open || !invoice) return;
    setMethod("cash");
    setTransferRef("");
    setNote("");
    setAmount(invoice.outstanding > 0 ? String(invoice.outstanding) : "");
  }, [open, invoice]);

  function printReceipt(paymentId: string) {
    if (iframeRef.current) {
      iframeRef.current.src = `/receipts/${paymentId}?autoprint=1`;
    } else {
      window.open(`/receipts/${paymentId}`, "_blank", "noopener,noreferrer");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || !ctx) return;

    const parsed = Number.parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("กรุณาระบุจำนวนเงิน");
      return;
    }
    const outstanding = invoice?.outstanding ?? 0;
    if (parsed > outstanding) {
      toast.error(`จำนวนเงินเกินยอดค้าง (${formatBaht(outstanding)})`);
      return;
    }
    if (method === "transfer" && !transferRef.trim()) {
      toast.error("กรุณาระบุเลขอ้างอิงการโอน");
      return;
    }

    setConfirmOpen(true);
  }

  async function handleConfirm() {
    if (!invoice || !ctx) return;

    const parsed = Number.parseFloat(amount);

    setSubmitting(true);
    const result = await recordPayment({
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      academicYearId: ctx.academicYearId,
      academicYearName: ctx.academicYearName,
      semesterId: ctx.semesterId,
      amount: parsed,
      paymentMethod: method,
      transferReference: method === "transfer" ? transferRef.trim() : undefined,
      note: note.trim() || undefined,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("บันทึกการชำระและออกใบเสร็จแล้ว");
    printReceipt(result.paymentId);
    setConfirmOpen(false);
    onOpenChange(false);
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["invoice-candidates"] });
    void queryClient.invalidateQueries({ queryKey: ["payments"] });
    router.refresh();
  }

  return (
    <>
      <iframe ref={iframeRef} className="hidden" title="receipt" />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>ชำระเงิน</DialogTitle>
              <DialogDescription>
                {invoice?.studentName} · {invoice?.studentCode} · {invoice?.gradeClassroom}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {!invoice || invoice.outstanding <= 0 ? (
                <p className="text-sm text-muted-foreground">ไม่พบรายการค้างชำระ</p>
              ) : (
                <div className="rounded-md border text-sm overflow-hidden">
                  {/* invoice header row */}
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/50 font-medium">
                    <span className="truncate max-w-[220px]">{invoice.invoiceName}</span>
                    <span className="tabular-nums shrink-0 ml-2">{formatBaht(invoice.outstanding)}</span>
                  </div>
                  {/* line items */}
                  {lines.length > 0 && (
                    <div className="divide-y divide-border/60">
                      {lines.map((line) => (
                        <div key={line.id} className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
                          <span>· {line.description}</span>
                          <span className="tabular-nums shrink-0 ml-2">{formatBaht(line.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {invoice && invoice.outstanding > 0 ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="pay-amount">จำนวนเงิน (บาท)</Label>
                    <Input
                      id="pay-amount"
                      type="number"
                      min={0.01}
                      max={invoice?.outstanding}
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>

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

                  {method === "transfer" ? (
                    <div className="grid gap-2">
                      <Label htmlFor="pay-ref">เลขอ้างอิง</Label>
                      <Input
                        id="pay-ref"
                        value={transferRef}
                        onChange={(e) => setTransferRef(e.target.value)}
                        placeholder="เลขที่อ้างอิงการโอน"
                        required
                      />
                    </div>
                  ) : null}

                  <div className="grid gap-2">
                    <Label htmlFor="pay-note">หมายเหตุ (ไม่บังคับ)</Label>
                    <Input
                      id="pay-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="หมายเหตุ"
                    />
                  </div>
                </>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => onOpenChange(false)}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={submitting || !invoice || invoice.outstanding <= 0}>
                {submitting ? "กำลังบันทึก..." : "บันทึกการชำระ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการชำระเงิน</AlertDialogTitle>
            <AlertDialogDescription>
              {invoice?.studentName} — ชำระ {formatBaht(Number.parseFloat(amount) || 0)}{" "}
              ({method === "cash" ? "เงินสด" : `โอน ref: ${transferRef}`})
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

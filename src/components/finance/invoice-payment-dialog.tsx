"use client";

import { Fragment, useEffect, useRef, useState } from "react";
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
  const amountInputRef = useRef<HTMLInputElement>(null);

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
    if (parsed > invoice.outstanding) {
      toast.error(`จำนวนเงินเกินยอดค้าง (${formatBaht(invoice.outstanding)})`);
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

    setSubmitting(true);
    const result = await recordPayment({
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      academicYearId: ctx.academicYearId,
      academicYearName: ctx.academicYearName,
      semesterId: ctx.semesterId,
      amount: Number.parseFloat(amount),
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

  const hasOutstanding = invoice && invoice.outstanding > 0;

  return (
    <>
      <iframe ref={iframeRef} className="hidden" title="receipt" />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>ชำระเงิน</DialogTitle>
              <DialogDescription>
                {invoice?.studentName} · {invoice?.studentCode} · {invoice?.gradeClassroom}
              </DialogDescription>
            </DialogHeader>

            {!hasOutstanding ? (
              <p className="text-sm text-muted-foreground">ไม่พบรายการค้างชำระ</p>
            ) : (
              <>
                {/* Invoice table — same style as payments panel */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ใบแจ้ง</TableHead>
                      <TableHead className="text-right">ค้าง</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <Fragment key={invoice.id}>
                      <TableRow>
                        <TableCell className="font-medium">{invoice.invoiceName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBaht(invoice.outstanding)}
                        </TableCell>
                      </TableRow>
                      {lines.map((line) => (
                        <TableRow key={line.id} className="border-0">
                          <TableCell className="py-0.5 pl-5 text-xs text-muted-foreground">
                            · {line.description}
                          </TableCell>
                          <TableCell className="py-0.5 text-right text-xs tabular-nums text-muted-foreground">
                            {formatBaht(line.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  </TableBody>
                </Table>

                {/* Form fields — amount + method side by side. Shared-row grid
                    so the input and select always align regardless of label
                    height. */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {/* row 1 — labels */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pay-amount">จำนวนเงิน (บาท)</Label>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        setAmount(String(invoice.outstanding));
                        setTimeout(() => {
                          amountInputRef.current?.focus();
                          amountInputRef.current?.select();
                        }, 50);
                      }}
                    >
                      ชำระเต็มจำนวน
                    </button>
                  </div>
                  <div className="flex items-center">
                    <Label>วิธีชำระ</Label>
                  </div>

                  {/* row 2 — fields */}
                  <Input
                    ref={amountInputRef}
                    id="pay-amount"
                    type="number"
                    min={0.01}
                    max={invoice.outstanding}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="tabular-nums"
                    required
                  />
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

                  {/* row 3 — helper text under amount only */}
                  <p className="col-start-1 text-xs text-muted-foreground">
                    ยอดค้าง {formatBaht(invoice.outstanding)}
                  </p>
                </div>

                {method === "transfer" && (
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
                )}

                <div className="grid gap-2">
                  <Label htmlFor="pay-note">หมายเหตุ</Label>
                  <Input
                    id="pay-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="หมายเหตุ (ไม่บังคับ)"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "กำลังบันทึก..." : "บันทึกและออกใบเสร็จ"}
                </Button>
              </>
            )}

            {!hasOutstanding && (
              <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                ปิด
              </Button>
            )}
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

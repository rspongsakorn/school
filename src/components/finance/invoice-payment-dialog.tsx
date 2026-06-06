"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { getStudentOutstandingAction, recordPayment } from "@/lib/actions/payments";
import { formatBaht } from "@/lib/format";
import type { InvoiceListRow } from "@/lib/queries/invoices";
import type { OutstandingInvoiceRow } from "@/lib/data/invoices";

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

  const [loading, setLoading] = useState(false);
  const [outstanding, setOutstanding] = useState<OutstandingInvoiceRow[]>([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [transferRef, setTransferRef] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !invoice || !ctx) return;
    setAmount("");
    setMethod("cash");
    setTransferRef("");
    setNote("");
    setOutstanding([]);
    setLoading(true);

    getStudentOutstandingAction(invoice.studentId, ctx.semesterId).then((result) => {
      setLoading(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOutstanding(result.invoices);
      const totalDue = result.invoices.reduce((sum, r) => sum + r.outstanding, 0);
      setAmount(totalDue > 0 ? String(totalDue) : "");
    });
  }, [open, invoice, ctx]);

  function printReceipt(paymentId: string) {
    if (iframeRef.current) {
      iframeRef.current.src = `/receipts/${paymentId}?autoprint=1`;
    } else {
      window.open(`/receipts/${paymentId}`, "_blank", "noopener,noreferrer");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || !ctx) return;

    const parsed = Number.parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("กรุณาระบุจำนวนเงิน");
      return;
    }
    const totalDue = outstanding.reduce((sum, r) => sum + r.outstanding, 0);
    if (parsed > totalDue) {
      toast.error(`จำนวนเงินเกินยอดค้างรวม (${formatBaht(totalDue)})`);
      return;
    }
    if (method === "transfer" && !transferRef.trim()) {
      toast.error("กรุณาระบุเลขอ้างอิงการโอน");
      return;
    }

    setSubmitting(true);
    const result = await recordPayment({
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
    onOpenChange(false);
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["invoice-candidates"] });
    void queryClient.invalidateQueries({ queryKey: ["payments"] });
    router.refresh();
  }

  const totalDue = outstanding.reduce((sum, r) => sum + r.outstanding, 0);

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
              {loading ? (
                <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูล...</p>
              ) : outstanding.length === 0 ? (
                <p className="text-sm text-muted-foreground">ไม่พบรายการค้างชำระ</p>
              ) : (
                <div className="rounded-md border text-sm">
                  {outstanding.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between px-3 py-2 border-b last:border-b-0"
                    >
                      <span className="text-muted-foreground truncate max-w-[200px]">{inv.invoiceName}</span>
                      <span className="tabular-nums font-medium">{formatBaht(inv.outstanding)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-2 font-semibold bg-muted/40">
                    <span>รวมค้างชำระ</span>
                    <span className="tabular-nums">{formatBaht(totalDue)}</span>
                  </div>
                </div>
              )}

              {!loading && outstanding.length > 0 ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="pay-amount">จำนวนเงิน (บาท)</Label>
                    <Input
                      id="pay-amount"
                      type="number"
                      min={0.01}
                      max={totalDue}
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
              <Button type="submit" disabled={submitting || loading || outstanding.length === 0}>
                {submitting ? "กำลังบันทึก..." : "บันทึกการชำระ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

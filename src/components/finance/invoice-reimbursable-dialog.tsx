"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateFinanceQueries } from "@/lib/queries/invalidate";
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
import { updateInvoiceReimbursable } from "@/lib/actions/invoices";
import type { InvoiceListRow } from "@/lib/data/invoices";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceListRow | null;
};

export function InvoiceReimbursableDialog({ open, onOpenChange, invoice }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  if (!invoice) return null;

  const targetValue = !invoice.isReimbursable;
  const targetLabel = targetValue ? "เบิกได้" : "เบิกไม่ได้";

  async function handleConfirm() {
    setSubmitting(true);
    const result = await updateInvoiceReimbursable(invoice!.id, targetValue);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`เปลี่ยนเป็นราคา ${targetLabel} แล้ว`);
    onOpenChange(false);
    invalidateFinanceQueries(queryClient);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>เปลี่ยนประเภทราคา</DialogTitle>
          <DialogDescription>
            {invoice.studentName} — เปลี่ยนเป็นราคา <b>{targetLabel}</b>?
            <br />
            ระบบจะคำนวณยอดในใบใหม่ตามอัตราปัจจุบัน
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

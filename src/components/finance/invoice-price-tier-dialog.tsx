"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateFinanceQueries } from "@/lib/queries/invalidate";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateInvoicePriceTier } from "@/lib/actions/invoices";
import { PRICE_TIERS, priceTierLabel, type PriceTier } from "@/lib/finance/price-tier";
import type { InvoiceListRow } from "@/lib/data/invoices";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceListRow | null;
};

export function InvoicePriceTierDialog({ open, onOpenChange, invoice }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {invoice ? (
          <DialogBody key={invoice.id} invoice={invoice} onOpenChange={onOpenChange} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DialogBody({
  invoice,
  onOpenChange,
}: {
  invoice: InvoiceListRow;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [tier, setTier] = useState<PriceTier>(invoice.priceTier);

  const unchanged = tier === invoice.priceTier;

  async function handleConfirm() {
    setSubmitting(true);
    const result = await updateInvoicePriceTier(invoice.id, tier);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`เปลี่ยนเป็นราคา ${priceTierLabel(tier)} แล้ว`);
    onOpenChange(false);
    invalidateFinanceQueries(queryClient);
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>เปลี่ยนประเภทราคา</DialogTitle>
        <DialogDescription>
          {invoice.studentName} — ปัจจุบันคือ <b>{priceTierLabel(invoice.priceTier)}</b>
          <br />
          เลือกประเภทราคาใหม่ ระบบจะคำนวณยอดในใบใหม่ตามอัตราปัจจุบัน
        </DialogDescription>
      </DialogHeader>
      <div
        role="radiogroup"
        aria-label="ประเภทราคา"
        className="grid grid-cols-3 gap-1 rounded-md border p-1"
      >
        {PRICE_TIERS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={tier === option}
            onClick={() => setTier(option)}
            disabled={submitting}
            className={cn(
              "rounded px-2 py-1.5 text-sm transition-colors disabled:opacity-50",
              tier === option ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {priceTierLabel(option)}
          </button>
        ))}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={submitting}
        >
          ยกเลิก
        </Button>
        <Button type="button" onClick={handleConfirm} disabled={submitting || unchanged}>
          {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
        </Button>
      </DialogFooter>
    </>
  );
}

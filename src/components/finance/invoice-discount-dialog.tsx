"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { updateInvoiceDiscount } from "@/lib/actions/invoices";
import type { InvoiceListRow } from "@/lib/data/invoices";

const discountTypeItems = [
  { value: "none", label: "ไม่มีส่วนลด" },
  { value: "percent", label: "เปอร์เซ็นต์ (%)" },
  { value: "fixed", label: "จำนวนเงิน (บาท)" },
];

type InvoiceDiscountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceListRow | null;
};

export function InvoiceDiscountDialog({ open, onOpenChange, invoice }: InvoiceDiscountDialogProps) {
  const router = useRouter();
  const [discountType, setDiscountType] = useState<"none" | "percent" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !invoice) return;
    if (!invoice.discountType) {
      setDiscountType("none");
      setDiscountValue("");
      return;
    }
    setDiscountType(invoice.discountType);
    setDiscountValue(String(invoice.discountValue ?? ""));
  }, [open, invoice]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;

    const type = discountType === "none" ? null : discountType;
    const value =
      type == null ? null : Number.parseFloat(discountValue);

    if (type && (value == null || !Number.isFinite(value) || value < 0)) {
      toast.error("กรุณาระบุส่วนลดให้ถูกต้อง");
      return;
    }

    setSubmitting(true);
    const result = await updateInvoiceDiscount(invoice.id, {
      discountType: type,
      discountValue: value,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("บันทึกส่วนลดแล้ว");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>แก้ไขส่วนลด</DialogTitle>
            <DialogDescription>
              {invoice?.studentName} — ยอดก่อนหัก ฿{invoice?.subtotal.toLocaleString("th-TH")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>ประเภทส่วนลด</Label>
              <Select
                value={discountType}
                onValueChange={(v) => setDiscountType(v as "none" | "percent" | "fixed")}
                items={discountTypeItems}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {discountTypeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {discountType !== "none" ? (
              <div className="grid gap-2">
                <Label htmlFor="discount-value">มูลค่าส่วนลด</Label>
                <Input
                  id="discount-value"
                  type="number"
                  min={0}
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

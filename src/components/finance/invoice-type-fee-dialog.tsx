"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSemesterContext } from "@/hooks/use-semester-context";
import {
  fetchFeeItems,
  fetchFeeRateMatrix,
  fetchInvoicedFeeItemIds,
  fetchInvoicedGradeIds,
} from "@/lib/queries/fee-rates";
import { FeeItemsSection } from "@/components/finance/fee-items-section";
import { FeeRatesMatrix } from "@/components/finance/fee-rates-matrix";
import type { InvoiceTypeRow } from "@/lib/data/invoice-types";

type Props = {
  invoiceType: InvoiceTypeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InvoiceTypeFeeDialog({ invoiceType, open, onOpenChange }: Props) {
  const { ctx, isLoading: ctxLoading } = useSemesterContext();
  const invoiceTypeId = invoiceType?.id ?? null;

  const { data: feeItems = [] } = useQuery({
    queryKey: ["fee-items", invoiceTypeId],
    queryFn: () => fetchFeeItems(invoiceTypeId!),
    enabled: open && Boolean(invoiceTypeId),
    staleTime: 60_000,
  });

  const { data: matrix, isLoading: matrixLoading } = useQuery({
    queryKey: ["fee-rate-matrix", ctx?.semesterId, invoiceTypeId],
    queryFn: () => fetchFeeRateMatrix(ctx!.semesterId, invoiceTypeId!),
    enabled: open && Boolean(ctx?.semesterId) && Boolean(invoiceTypeId),
    staleTime: 30_000,
  });

  const { data: invoicedItemIds = [] } = useQuery({
    queryKey: ["invoiced-fee-items", invoiceTypeId],
    queryFn: () => fetchInvoicedFeeItemIds(invoiceTypeId!),
    enabled: open && Boolean(invoiceTypeId),
  });

  const { data: invoicedGradeIds = [] } = useQuery({
    queryKey: ["invoiced-grades", ctx?.semesterId, invoiceTypeId],
    queryFn: () => fetchInvoicedGradeIds(ctx!.semesterId, invoiceTypeId!),
    enabled: open && Boolean(ctx?.semesterId) && Boolean(invoiceTypeId),
  });

  const lockedItemIds = useMemo(() => new Set(invoicedItemIds), [invoicedItemIds]);
  const lockedGradeIds = useMemo(() => new Set(invoicedGradeIds), [invoicedGradeIds]);

  const isLoading = ctxLoading || matrixLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] w-[96vw] max-w-[96vw] overflow-y-auto sm:max-w-[96vw]">
        <DialogHeader>
          <DialogTitle>ตั้งค่าค่าธรรมเนียม — {invoiceType?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {!ctx && !ctxLoading ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษา/ภาคเรียนในระบบ</p>
          ) : isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : ctx && matrix && invoiceTypeId ? (
            <>
              <FeeItemsSection
                items={feeItems}
                invoiceTypeId={invoiceTypeId}
                lockedItemIds={lockedItemIds}
              />
              <FeeRatesMatrix
                semesterId={ctx.semesterId}
                invoiceTypeId={invoiceTypeId}
                matrix={matrix}
                lockedGradeIds={lockedGradeIds}
              />
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchFeeItems, fetchFeeRateMatrix } from "@/lib/queries/fee-rates";
import { FeeItemsSection } from "@/components/finance/fee-items-section";
import { FeeRatesMatrix } from "@/components/finance/fee-rates-matrix";
import type { ReceiptTypeRow } from "@/lib/data/receipt-types";

type Props = {
  receiptType: ReceiptTypeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReceiptTypeFeeDialog({ receiptType, open, onOpenChange }: Props) {
  const { ctx, isLoading: ctxLoading } = useSemesterContext();
  const receiptTypeId = receiptType?.id ?? null;

  const { data: feeItems = [] } = useQuery({
    queryKey: ["fee-items", receiptTypeId],
    queryFn: () => fetchFeeItems(receiptTypeId!),
    enabled: open && Boolean(receiptTypeId),
    staleTime: 60_000,
  });

  const { data: matrix, isLoading: matrixLoading } = useQuery({
    queryKey: ["fee-rate-matrix", ctx?.semesterId, receiptTypeId],
    queryFn: () => fetchFeeRateMatrix(ctx!.semesterId, receiptTypeId!),
    enabled: open && Boolean(ctx?.semesterId) && Boolean(receiptTypeId),
    staleTime: 30_000,
  });

  const isLoading = ctxLoading || matrixLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] w-[96vw] max-w-[96vw] overflow-y-auto sm:max-w-[96vw]">
        <DialogHeader>
          <DialogTitle>ตั้งค่าค่าธรรมเนียม — {receiptType?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {!ctx && !ctxLoading ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษา/ภาคเรียนในระบบ</p>
          ) : isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : ctx && matrix && receiptTypeId ? (
            <>
              <FeeItemsSection items={feeItems} receiptTypeId={receiptTypeId} />
              <FeeRatesMatrix semesterId={ctx.semesterId} matrix={matrix} />
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

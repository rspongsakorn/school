"use client";

import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchFeeItems, fetchFeeRateMatrix } from "@/lib/queries/fee-rates";
import { FeeItemsSection } from "@/components/finance/fee-items-section";
import { FeeRatesMatrix } from "@/components/finance/fee-rates-matrix";

export function FeeRatesPagePanel() {
  useRequireRole("admin");
  const { ctx, isLoading: ctxLoading } = useSemesterContext();

  const { data: feeItems = [] } = useQuery({
    queryKey: ["fee-items"],
    queryFn: fetchFeeItems,
    staleTime: 60_000,
  });

  const { data: matrix, isLoading: matrixLoading } = useQuery({
    queryKey: ["fee-rate-matrix", ctx?.semesterId],
    queryFn: () => fetchFeeRateMatrix(ctx!.semesterId),
    enabled: Boolean(ctx?.semesterId),
    staleTime: 30_000,
  });

  const isLoading = ctxLoading || matrixLoading;

  return (
    <>
      <AppHeader title="ตั้งค่าค่าธรรมเนียม" basePath="/fee-rates" />
      <main className="space-y-6 p-6">
        {!ctx && !ctxLoading ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษา/ภาคเรียนในระบบ</p>
        ) : isLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        ) : ctx && matrix ? (
          <>
            <FeeItemsSection items={feeItems} />
            <FeeRatesMatrix semesterId={ctx.semesterId} matrix={matrix} />
          </>
        ) : null}
      </main>
    </>
  );
}

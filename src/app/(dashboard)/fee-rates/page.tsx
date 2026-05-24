import { AppHeader } from "@/components/app-header";
import { FeeItemsSection } from "@/components/finance/fee-items-section";
import { FeeRatesMatrix } from "@/components/finance/fee-rates-matrix";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listFeeItems } from "@/lib/data/fee-items";
import { getFeeRateMatrix } from "@/lib/data/fee-rates";
import { getPageHeaderProps } from "@/lib/data/page-header";
import { loadSemesterPageContext } from "@/lib/data/semester-page-context";

type SearchParams = Promise<{ year?: string; semester?: string }>;

export default async function FeeRatesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  await requireAdminPage();

  const [header, page, feeItems] = await Promise.all([
    getPageHeaderProps("/fee-rates", sp),
    loadSemesterPageContext(sp.year, sp.semester),
    listFeeItems(),
  ]);

  const matrix = page.ctx
    ? await getFeeRateMatrix(page.ctx.semesterId)
    : { grades: [], items: [], rates: {} };

  return (
    <>
      <AppHeader title="ตั้งค่าค่าธรรมเนียม" {...header} />
      <main className="space-y-6 p-6">
        {!page.ctx ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษา/ภาคเรียนในระบบ</p>
        ) : (
          <>
            <FeeItemsSection items={feeItems} />
            <FeeRatesMatrix semesterId={page.ctx.semesterId} matrix={matrix} />
          </>
        )}
      </main>
    </>
  );
}

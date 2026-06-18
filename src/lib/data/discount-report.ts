import { createClient } from "@/lib/supabase/server";

export type DiscountReportItemRow = {
  feeItemId: string;
  feeItemName: string;
  count: number;
  totalDiscount: number;
};

export type DiscountReportResult = {
  rows: DiscountReportItemRow[];
  grandTotal: number;
};

export async function getDiscountReport(params: {
  academicYearId: string;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
}): Promise<DiscountReportResult> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("payment_discounts")
    .select(
      "amount, fee_item_id, fee_items ( name ), payments!inner ( status, academic_year_id, paid_at )",
    )
    .eq("payments.status", "active")
    .eq("payments.academic_year_id", params.academicYearId)
    .gte("payments.paid_at", `${params.dateFrom}T00:00:00+07:00`)
    .lte("payments.paid_at", `${params.dateTo}T23:59:59+07:00`);

  type Row = {
    amount: string;
    fee_item_id: string;
    fee_items: { name: string } | null;
  };

  const byItem = new Map<string, DiscountReportItemRow>();
  let grandTotal = 0;

  for (const r of (data ?? []) as unknown as Row[]) {
    const amount = Number(r.amount);
    grandTotal += amount;
    const existing = byItem.get(r.fee_item_id);
    if (existing) {
      existing.count += 1;
      existing.totalDiscount = Math.round((existing.totalDiscount + amount) * 100) / 100;
    } else {
      byItem.set(r.fee_item_id, {
        feeItemId: r.fee_item_id,
        feeItemName: r.fee_items?.name ?? "—",
        count: 1,
        totalDiscount: amount,
      });
    }
  }

  return {
    rows: [...byItem.values()].sort((a, b) => b.totalDiscount - a.totalDiscount),
    grandTotal: Math.round(grandTotal * 100) / 100,
  };
}

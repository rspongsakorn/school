import { describe, expect, it } from "vitest";
import { groupDailyRevenue, summarizeByMethod, type DailyPayment } from "./daily";

const p = (over: Partial<DailyPayment>): DailyPayment => ({
  amount: 100,
  paymentMethod: "cash",
  paidAt: "2026-05-28T05:00:00Z",
  status: "active",
  ...over,
});

describe("groupDailyRevenue", () => {
  it("splits cash and transfer totals per day", () => {
    const rows = groupDailyRevenue([
      p({ amount: 300, paymentMethod: "cash" }),
      p({ amount: 200, paymentMethod: "transfer" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dateKey: "2026-05-28",
      receiptCount: 2,
      cashTotal: 300,
      transferTotal: 200,
      total: 500,
    });
  });

  it("excludes voided payments from totals but counts them", () => {
    const rows = groupDailyRevenue([
      p({ amount: 300, paymentMethod: "cash" }),
      p({ amount: 999, status: "voided" }),
    ]);
    expect(rows[0]).toMatchObject({
      receiptCount: 1,
      cashTotal: 300,
      total: 300,
      voidedCount: 1,
      voidedAmount: 999,
    });
  });

  it("groups across days and sorts newest first", () => {
    const rows = groupDailyRevenue([
      p({ paidAt: "2026-05-27T05:00:00Z" }),
      p({ paidAt: "2026-05-28T05:00:00Z" }),
    ]);
    expect(rows.map((r) => r.dateKey)).toEqual(["2026-05-28", "2026-05-27"]);
  });
});

describe("summarizeByMethod", () => {
  it("totals cash and transfer separately and leaves voided receipts out", () => {
    const s = summarizeByMethod([
      p({ amount: 2900, paymentMethod: "cash" }),
      p({ amount: 200, paymentMethod: "cash" }),
      p({ amount: 3400, paymentMethod: "transfer" }),
      p({ amount: 999, paymentMethod: "transfer", status: "voided" }),
    ]);
    expect(s).toEqual({
      cashCount: 2,
      cashTotal: 3100,
      transferCount: 1,
      transferTotal: 3400,
      total: 6500,
      voidedCount: 1,
      voidedAmount: 999,
    });
  });
});

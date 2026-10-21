import { describe, expect, it } from "vitest";
import { allocateWaiverToLines, buildDiscountReport } from "@/lib/finance/discount-report";

const insurance = { feeItemId: "ins", feeItemName: "ค่าประกันอุบัติเหตุ", amount: 200 };
const lunch = { feeItemId: "lunch", feeItemName: "ค่าอาหารกลางวัน", amount: 300 };

describe("allocateWaiverToLines", () => {
  it("gives a single-line invoice the whole waiver", () => {
    expect(allocateWaiverToLines(200, [insurance])).toEqual([
      { feeItemId: "ins", feeItemName: "ค่าประกันอุบัติเหตุ", amount: 200 },
    ]);
  });

  it("splits a multi-line waiver in proportion to the lines", () => {
    const out = allocateWaiverToLines(250, [insurance, lunch]);
    expect(out.map((l) => l.amount)).toEqual([100, 150]);
  });

  it("puts the rounding remainder on the last line so the parts add up", () => {
    const out = allocateWaiverToLines(100, [
      { feeItemId: "a", feeItemName: "A", amount: 1 },
      { feeItemId: "b", feeItemName: "B", amount: 1 },
      { feeItemId: "c", feeItemName: "C", amount: 1 },
    ]);
    expect(out.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(100, 2);
    expect(out.map((l) => l.amount)).toEqual([33.33, 33.33, 33.34]);
  });

  it("returns nothing for an invoice with no lines", () => {
    expect(allocateWaiverToLines(200, [])).toEqual([]);
  });
});

describe("buildDiscountReport", () => {
  it("keeps payment-time discounts and waivers apart on the same fee item", () => {
    const report = buildDiscountReport(
      [{ feeItemId: "ins", feeItemName: "ค่าประกันอุบัติเหตุ", amount: 50 }],
      [{ discountValue: 200, lines: [insurance] }],
    );
    expect(report.rows).toEqual([
      {
        feeItemId: "ins",
        feeItemName: "ค่าประกันอุบัติเหตุ",
        count: 1,
        totalDiscount: 50,
        waivedCount: 1,
        waivedTotal: 200,
      },
    ]);
    expect(report.paymentTotal).toBe(50);
    expect(report.waivedTotal).toBe(200);
    expect(report.grandTotal).toBe(250);
  });

  it("lists a fee item that only has waivers", () => {
    const report = buildDiscountReport([], [{ discountValue: 200, lines: [insurance] }]);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ count: 0, totalDiscount: 0, waivedCount: 1, waivedTotal: 200 });
  });

  it("sorts the biggest combined amount first", () => {
    const report = buildDiscountReport(
      [{ feeItemId: "lunch", feeItemName: "ค่าอาหารกลางวัน", amount: 100 }],
      [{ discountValue: 200, lines: [insurance] }],
    );
    expect(report.rows.map((r) => r.feeItemId)).toEqual(["ins", "lunch"]);
  });

  it("is empty when there is nothing", () => {
    expect(buildDiscountReport([], [])).toEqual({
      rows: [],
      paymentTotal: 0,
      waivedTotal: 0,
      grandTotal: 0,
    });
  });
});

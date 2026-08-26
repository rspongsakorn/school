import { describe, expect, it } from "vitest";
import {
  resolveBulkPaymentTargets,
  summarizeTargets,
  type BulkPaymentCandidate,
} from "./bulk-payment-selection";

function row(
  id: string,
  outstanding: number,
  studentName = `นักเรียน ${id}`,
): BulkPaymentCandidate {
  return {
    id,
    studentCode: `S${id}`,
    studentName,
    gradeClassroom: "ป.4/2",
    invoiceName: "ค่าประกันอุบัติเหตุ",
    outstanding,
  };
}

describe("resolveBulkPaymentTargets", () => {
  it("keeps only the ticked rows, in table order", () => {
    const rows = [row("1", 300), row("2", 300), row("3", 300)];
    const result = resolveBulkPaymentTargets(rows, new Set(["3", "1"]));
    expect(result.payable.map((r) => r.id)).toEqual(["1", "3"]);
    expect(result.skipped).toEqual([]);
  });

  it("moves ticked rows with no outstanding balance into skipped", () => {
    const rows = [row("1", 300), row("2", 0, "สมชาย ใจดี")];
    const result = resolveBulkPaymentTargets(rows, new Set(["1", "2"]));
    expect(result.payable.map((r) => r.id)).toEqual(["1"]);
    expect(result.skipped).toEqual([
      { id: "2", studentName: "สมชาย ใจดี", reason: "ไม่มียอดค้างชำระ" },
    ]);
  });

  it("returns empty groups when nothing is ticked", () => {
    const result = resolveBulkPaymentTargets([row("1", 300)], new Set());
    expect(result).toEqual({ payable: [], skipped: [] });
  });

  it("ignores ticked ids that are not on the current page", () => {
    const result = resolveBulkPaymentTargets([row("1", 300)], new Set(["1", "999"]));
    expect(result.payable.map((r) => r.id)).toEqual(["1"]);
  });
});

describe("summarizeTargets", () => {
  it("counts rows and sums the outstanding amounts", () => {
    expect(summarizeTargets([row("1", 300), row("2", 450.5)])).toEqual({
      count: 2,
      totalAmount: 750.5,
    });
  });

  it("rounds the total to 2 decimals", () => {
    expect(summarizeTargets([row("1", 0.1), row("2", 0.2)]).totalAmount).toBe(0.3);
  });

  it("returns a zero summary for an empty batch", () => {
    expect(summarizeTargets([])).toEqual({ count: 0, totalAmount: 0 });
  });
});

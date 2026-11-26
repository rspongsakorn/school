import { describe, expect, it } from "vitest";
import {
  groupLineStates,
  outstandingLinesLabel,
  resolveLineSelection,
  type PayableLine,
} from "@/lib/finance/line-payment";

const lines: PayableLine[] = [
  { id: "A", description: "ค่าเทอม", amount: 8000, isPaid: false },
  { id: "B", description: "ค่าอาหาร", amount: 2500, isPaid: false },
  { id: "C", description: "ค่าห้องปรับอากาศ", amount: 1500, isPaid: false },
];

describe("resolveLineSelection", () => {
  it("sums the selected lines", () => {
    expect(
      resolveLineSelection({ lines, selectedLineIds: ["A", "B"], discountByLineId: new Map() }),
    ).toEqual({
      ok: true,
      amount: 10500,
      allocations: [
        { invoiceLineId: "A", amount: 8000 },
        { invoiceLineId: "B", amount: 2500 },
      ],
    });
  });

  it("takes a discount off the line it was given on", () => {
    expect(
      resolveLineSelection({
        lines,
        selectedLineIds: ["A", "B"],
        discountByLineId: new Map([["A", 500]]),
      }),
    ).toEqual({
      ok: true,
      amount: 10000,
      allocations: [
        { invoiceLineId: "A", amount: 7500 },
        { invoiceLineId: "B", amount: 2500 },
      ],
    });
  });

  it("refuses an empty selection", () => {
    expect(
      resolveLineSelection({ lines, selectedLineIds: [], discountByLineId: new Map() }),
    ).toEqual({ ok: false, error: "เลือกรายการที่ชำระอย่างน้อย 1 รายการ" });
  });

  it("refuses a line that is already paid", () => {
    const paid = lines.map((l) => (l.id === "C" ? { ...l, isPaid: true } : l));
    expect(
      resolveLineSelection({ lines: paid, selectedLineIds: ["C"], discountByLineId: new Map() }),
    ).toEqual({ ok: false, error: "รายการนี้ชำระแล้ว" });
  });

  it("refuses a line that is not on the invoice", () => {
    expect(
      resolveLineSelection({ lines, selectedLineIds: ["X"], discountByLineId: new Map() }),
    ).toEqual({ ok: false, error: "รายการไม่อยู่ในใบแจ้งนี้" });
  });

  it("refuses a discount on a line that is not selected", () => {
    expect(
      resolveLineSelection({
        lines,
        selectedLineIds: ["A"],
        discountByLineId: new Map([["B", 100]]),
      }),
    ).toEqual({ ok: false, error: "ให้ส่วนลดได้เฉพาะรายการที่เลือก" });
  });

  it("refuses a discount larger than the line", () => {
    expect(
      resolveLineSelection({
        lines,
        selectedLineIds: ["C"],
        discountByLineId: new Map([["C", 1501]]),
      }),
    ).toEqual({ ok: false, error: "ส่วนลดเกินยอดรายการ" });
  });

  it("counts a line picked twice once", () => {
    expect(
      resolveLineSelection({ lines, selectedLineIds: ["A", "A"], discountByLineId: new Map() }),
    ).toEqual({ ok: true, amount: 8000, allocations: [{ invoiceLineId: "A", amount: 8000 }] });
  });
});

describe("outstandingLinesLabel", () => {
  it("is blank for a paid invoice", () => {
    expect(outstandingLinesLabel({ status: "paid", tracked: true, unpaidLineNames: [] })).toBe("");
  });

  it("is blank for an unpaid invoice (every line is owed)", () => {
    expect(
      outstandingLinesLabel({ status: "unpaid", tracked: true, unpaidLineNames: ["ค่าเทอม"] }),
    ).toBe("");
  });

  it("names the one line still owed", () => {
    expect(
      outstandingLinesLabel({
        status: "partial",
        tracked: true,
        unpaidLineNames: ["ค่าห้องปรับอากาศ"],
      }),
    ).toBe("ค่าห้องปรับอากาศ");
  });

  it("joins several owed lines", () => {
    expect(
      outstandingLinesLabel({
        status: "partial",
        tracked: true,
        unpaidLineNames: ["ค่าอาหาร", "ค่าห้องปรับอากาศ"],
      }),
    ).toBe("ค่าอาหาร, ค่าห้องปรับอากาศ");
  });

  it("says unknown for a partial invoice paid before lines were recorded", () => {
    expect(
      outstandingLinesLabel({ status: "partial", tracked: false, unpaidLineNames: [] }),
    ).toBe("ไม่ระบุ (ชำระก่อนระบบใหม่)");
  });
});

describe("groupLineStates", () => {
  const row = (
    invoice_id: string,
    invoice_line_id: string,
    amount: number | string,
    is_paid = false,
    invoice_tracked = true,
  ) => ({ invoice_id, invoice_line_id, description: `d-${invoice_line_id}`, amount, is_paid, invoice_tracked });

  it("groups rows by invoice and parses amounts", () => {
    const map = groupLineStates([row("I1", "A", "8000.00"), row("I1", "B", 2500), row("I2", "C", "1500")]);
    expect(map.size).toBe(2);
    expect(map.get("I1")).toEqual({
      tracked: true,
      lines: [
        { id: "A", description: "d-A", amount: 8000, isPaid: false },
        { id: "B", description: "d-B", amount: 2500, isPaid: false },
      ],
    });
  });

  it("marks the invoice untracked when any row says so", () => {
    const map = groupLineStates([row("I1", "A", 1, false, true), row("I1", "B", 1, false, false)]);
    expect(map.get("I1")?.tracked).toBe(false);
  });

  it("lists a line once even if a paged read returns it twice", () => {
    const map = groupLineStates([row("I1", "A", 1), row("I1", "B", 1), row("I1", "A", 1)]);
    expect(map.get("I1")?.lines.map((l) => l.id)).toEqual(["A", "B"]);
  });

  it("keeps a zero line paid", () => {
    const map = groupLineStates([row("I1", "Z", "0", true)]);
    expect(map.get("I1")?.lines[0]).toEqual({ id: "Z", description: "d-Z", amount: 0, isPaid: true });
  });
});

import { describe, expect, it } from "vitest";
import { flattenReceiptsForIssuanceReport, type DailyDetailReceipt } from "./reports";

const r = (over: Partial<DailyDetailReceipt>): DailyDetailReceipt => ({
  paymentId: "p1",
  receiptNumber: "ETC0001",
  paidAt: "2026-07-07T02:00:00Z",
  timeLabel: "09:00",
  studentName: "เด็กหญิงทดสอบ ทดสอบ",
  studentCode: "69210001",
  gradeClassroom: "ป.1/1",
  paymentMethod: "cash",
  amount: 150,
  status: "active",
  recordedByName: "นันทิศา",
  ...over,
});

describe("flattenReceiptsForIssuanceReport", () => {
  it("sorts all receipts across dates oldest to newest", () => {
    const byDate = {
      "2026-07-08": [r({ paymentId: "b", paidAt: "2026-07-08T02:00:00Z" })],
      "2026-07-07": [r({ paymentId: "a", paidAt: "2026-07-07T02:00:00Z" })],
    };
    const flat = flattenReceiptsForIssuanceReport(byDate);
    expect(flat.map((x) => x.paymentId)).toEqual(["a", "b"]);
  });

  it("totals only active receipts, excluding voided", () => {
    const byDate = {
      "2026-07-07": [
        r({ paymentId: "a", amount: 150, status: "active" }),
        r({ paymentId: "b", amount: 999, status: "voided" }),
      ],
    };
    const flat = flattenReceiptsForIssuanceReport(byDate);
    const total = flat
      .filter((x) => x.status === "active")
      .reduce((sum, x) => sum + x.amount, 0);
    expect(total).toBe(150);
  });
});

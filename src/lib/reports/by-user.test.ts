import { describe, expect, it } from "vitest";
import { groupRevenueByUser, type UserPayment } from "./by-user";

const p = (over: Partial<UserPayment>): UserPayment => ({
  profileId: "user-1",
  recordedByName: "สมชาย",
  amount: 100,
  paymentMethod: "cash",
  status: "active",
  ...over,
});

describe("groupRevenueByUser", () => {
  it("splits cash and transfer totals per user", () => {
    const rows = groupRevenueByUser([
      p({ amount: 300, paymentMethod: "cash" }),
      p({ amount: 200, paymentMethod: "transfer" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      profileId: "user-1",
      recordedByName: "สมชาย",
      receiptCount: 2,
      cashTotal: 300,
      transferTotal: 200,
      total: 500,
    });
  });

  it("excludes voided payments from totals but counts them", () => {
    const rows = groupRevenueByUser([
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

  it("groups across users and sorts by total descending", () => {
    const rows = groupRevenueByUser([
      p({ profileId: "user-1", recordedByName: "สมชาย", amount: 100 }),
      p({ profileId: "user-2", recordedByName: "สมหญิง", amount: 500 }),
    ]);
    expect(rows.map((r) => r.profileId)).toEqual(["user-2", "user-1"]);
  });

  it("falls back to an 'unknown' group when there is no profile id", () => {
    const rows = groupRevenueByUser([p({ profileId: null, recordedByName: "—" })]);
    expect(rows[0]).toMatchObject({ profileId: "unknown", recordedByName: "—" });
  });
});

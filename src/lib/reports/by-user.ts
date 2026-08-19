export type UserPayment = {
  profileId: string | null;
  recordedByName: string;
  amount: number;
  paymentMethod: "cash" | "transfer";
  status: "active" | "voided";
};

export type UserRevenueRow = {
  profileId: string;
  recordedByName: string;
  receiptCount: number;
  cashTotal: number;
  transferTotal: number;
  total: number;
  voidedCount: number;
  voidedAmount: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function groupRevenueByUser(payments: UserPayment[]): UserRevenueRow[] {
  const byUser = new Map<string, UserRevenueRow>();

  for (const payment of payments) {
    const profileId = payment.profileId ?? "unknown";
    let row = byUser.get(profileId);
    if (!row) {
      row = {
        profileId,
        recordedByName: payment.recordedByName,
        receiptCount: 0,
        cashTotal: 0,
        transferTotal: 0,
        total: 0,
        voidedCount: 0,
        voidedAmount: 0,
      };
      byUser.set(profileId, row);
    }

    const amount = Number(payment.amount);
    if (payment.status === "voided") {
      row.voidedCount += 1;
      row.voidedAmount = round2(row.voidedAmount + amount);
      continue;
    }

    row.receiptCount += 1;
    if (payment.paymentMethod === "cash") {
      row.cashTotal = round2(row.cashTotal + amount);
    } else {
      row.transferTotal = round2(row.transferTotal + amount);
    }
    row.total = round2(row.total + amount);
  }

  return [...byUser.values()].sort((a, b) => b.total - a.total);
}

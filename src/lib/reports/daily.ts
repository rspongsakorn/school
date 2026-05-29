import { bangkokDateKey } from "./date";

export type DailyPayment = {
  amount: number;
  paymentMethod: "cash" | "transfer";
  paidAt: string;
  status: "active" | "voided";
};

export type DailyRevenueRow = {
  dateKey: string;
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

export function groupDailyRevenue(payments: DailyPayment[]): DailyRevenueRow[] {
  const byDate = new Map<string, DailyRevenueRow>();

  for (const payment of payments) {
    const dateKey = bangkokDateKey(payment.paidAt);
    let row = byDate.get(dateKey);
    if (!row) {
      row = {
        dateKey,
        receiptCount: 0,
        cashTotal: 0,
        transferTotal: 0,
        total: 0,
        voidedCount: 0,
        voidedAmount: 0,
      };
      byDate.set(dateKey, row);
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

  return [...byDate.values()].sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
}

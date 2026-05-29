import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBaht } from "@/lib/format";
import type { DashboardStats } from "@/lib/data/dashboard";

const R = 58;
const C = 2 * Math.PI * R; // circumference

export function PaymentDonut({ stats }: { stats: DashboardStats }) {
  const paid = stats.paidCount;
  const overdue = stats.overdueCount;
  const total = paid + overdue;

  const paidFraction = total > 0 ? paid / total : 0;
  const paidLen = paidFraction * C;
  const overdueLen = C - paidLen;
  const percent = total > 0 ? Math.round(paidFraction * 1000) / 10 : 0;

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">ชำระแล้ว vs ค้างชำระ</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            ยังไม่มีใบแจ้งชำระ
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-6">
            <svg width="150" height="150" viewBox="0 0 150 150" className="shrink-0">
              <circle cx="75" cy="75" r={R} fill="none" stroke="var(--muted)" strokeWidth="20" />
              <circle
                cx="75"
                cy="75"
                r={R}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="20"
                strokeDasharray={`${paidLen} ${C - paidLen}`}
                strokeLinecap="round"
                transform="rotate(-90 75 75)"
              />
              {overdue > 0 ? (
                <circle
                  cx="75"
                  cy="75"
                  r={R}
                  fill="none"
                  stroke="#e0a106"
                  strokeWidth="20"
                  strokeDasharray={`${overdueLen} ${C - overdueLen}`}
                  strokeDashoffset={-paidLen}
                  strokeLinecap="round"
                  transform="rotate(-90 75 75)"
                />
              ) : null}
              <text
                x="75"
                y="70"
                textAnchor="middle"
                className="fill-foreground text-2xl font-bold"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {percent}%
              </text>
              <text x="75" y="92" textAnchor="middle" className="fill-muted-foreground text-xs">
                ชำระแล้ว
              </text>
            </svg>

            <div className="space-y-4 text-sm">
              <div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-3 w-3 rounded-sm bg-primary" />
                  ชำระแล้ว
                </div>
                <p className="mt-0.5 text-xl font-bold tabular-nums">
                  {paid.toLocaleString("th-TH")}{" "}
                  <span className="text-xs font-medium text-muted-foreground">ใบ</span>
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: "#e0a106" }} />
                  ค้างชำระ
                </div>
                <p className="mt-0.5 text-xl font-bold tabular-nums">
                  {overdue.toLocaleString("th-TH")}{" "}
                  <span className="text-xs font-medium text-muted-foreground">
                    ใบ · {formatBaht(stats.overdueAmount)}
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

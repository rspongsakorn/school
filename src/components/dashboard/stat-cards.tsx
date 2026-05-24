import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CircleAlert,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBaht } from "@/lib/format";
import type { DashboardStats } from "@/lib/data/dashboard";

export function StatCards({ stats }: { stats: DashboardStats }) {
  const items = [
    {
      title: "นักเรียนที่ลงทะเบียน",
      value: stats.totalStudents.toLocaleString("th-TH"),
      delta: "—",
      deltaLabel: "ปีการศึกษาปัจจุบัน",
      positive: true,
      icon: Users,
    },
    {
      title: "ยอดเก็บได้",
      value: formatBaht(stats.totalCollected),
      delta: "—",
      deltaLabel: "รายการชำระที่ใช้งาน",
      positive: true,
      icon: Banknote,
    },
    {
      title: "ชำระแล้ว",
      value: stats.paidCount.toLocaleString("th-TH"),
      suffix: stats.paidCount > 0 ? `(${stats.paidRate}%)` : undefined,
      delta: "—",
      deltaLabel: "จากใบแจ้งชำระทั้งหมด",
      positive: true,
      icon: CircleAlert,
    },
    {
      title: "ค้างชำระ",
      value: stats.overdueCount.toLocaleString("th-TH"),
      suffix:
        stats.overdueCount > 0 ? `(${formatBaht(stats.overdueAmount)})` : undefined,
      delta: "—",
      deltaLabel: "ใบแจ้งที่ยังไม่ครบ",
      positive: false,
      icon: CircleAlert,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {items.map((stat) => {
        const Icon = stat.icon;
        const DeltaIcon = stat.positive ? ArrowUpRight : ArrowDownRight;
        const deltaColor = stat.positive ? "text-emerald-700" : "text-amber-700";

        return (
          <Card key={stat.title} className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <Icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">{stat.value}</span>
                {stat.suffix ? (
                  <span className="text-sm text-muted-foreground">{stat.suffix}</span>
                ) : null}
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs">
                <DeltaIcon className={`h-3 w-3 ${deltaColor}`} />
                <span className={deltaColor}>{stat.delta}</span>
                <span className="text-muted-foreground">{stat.deltaLabel}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

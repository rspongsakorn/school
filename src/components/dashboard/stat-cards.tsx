import {
  Banknote,
  CheckCircle2,
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
      caption: "ปีการศึกษาปัจจุบัน",
      icon: Users,
      iconColor: "text-muted-foreground",
    },
    {
      title: "ยอดเก็บได้",
      value: formatBaht(stats.totalCollected),
      caption: "รายการชำระที่ใช้งาน",
      icon: Banknote,
      iconColor: "text-emerald-600",
    },
    {
      title: "ชำระแล้ว",
      value: stats.paidCount.toLocaleString("th-TH"),
      suffix: stats.paidCount > 0 ? `(${stats.paidRate}%)` : undefined,
      caption: "จากใบแจ้งชำระทั้งหมด",
      icon: CheckCircle2,
      iconColor: "text-emerald-600",
    },
    {
      title: "ค้างชำระ",
      value: stats.overdueCount.toLocaleString("th-TH"),
      suffix:
        stats.overdueCount > 0 ? `(${formatBaht(stats.overdueAmount)})` : undefined,
      caption: "ใบแจ้งที่ยังไม่ครบ",
      icon: CircleAlert,
      iconColor: stats.overdueCount > 0 ? "text-amber-600" : "text-muted-foreground",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((stat) => {
        const Icon = stat.icon;

        return (
          <Card key={stat.title} className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <Icon className={`h-5 w-5 ${stat.iconColor}`} />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">{stat.value}</span>
                {stat.suffix ? (
                  <span className="text-sm text-muted-foreground">{stat.suffix}</span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{stat.caption}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CircleAlert,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBaht } from "@/lib/mock-data";

const stats = [
  {
    title: "นักเรียนทั้งหมด",
    value: "1,248",
    delta: "+12",
    deltaLabel: "เทียบภาคเรียนที่แล้ว",
    positive: true,
    icon: Users,
  },
  {
    title: "ยอดเก็บได้",
    value: formatBaht(2847500),
    delta: formatBaht(125000),
    deltaLabel: "เดือนนี้",
    positive: true,
    icon: Banknote,
  },
  {
    title: "ชำระแล้ว",
    value: "1,089",
    suffix: "(87.3%)",
    delta: "+5.2%",
    deltaLabel: "จากเป้าหมาย 95%",
    positive: true,
    icon: CircleAlert,
  },
  {
    title: "ค้างชำระ",
    value: "159",
    suffix: `(${formatBaht(478500)})`,
    delta: "-23",
    deltaLabel: "ลดลงจากเดือนก่อน",
    positive: false,
    icon: CircleAlert,
  },
];

export function StatCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => {
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

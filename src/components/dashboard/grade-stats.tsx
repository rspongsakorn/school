import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { GradeStatRow } from "@/lib/data/dashboard";

type GradeStatsProps = {
  gradeStats: GradeStatRow[];
  yearName?: string;
  semesterNumber?: number;
};

export function GradeStats({ gradeStats, yearName, semesterNumber }: GradeStatsProps) {
  const subtitle =
    yearName && semesterNumber
      ? `ปีการศึกษา ${yearName} ภาคเรียนที่ ${semesterNumber}`
      : "ยังไม่ได้ตั้งค่าปีการศึกษา";

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle>สถิติการชำระตามระดับชั้น</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {gradeStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            ยังไม่มีระดับชั้นหรือข้อมูลการชำระ
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gradeStats.map((item) => (
              <div key={item.grade} className="space-y-2 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.grade}</span>
                  <span className="text-sm font-semibold tabular-nums text-primary">
                    {item.rate}%
                  </span>
                </div>
                <Progress value={item.rate} className="h-2" />
                <p className="text-xs text-muted-foreground tabular-nums">
                  {item.paid}/{item.total} คน
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

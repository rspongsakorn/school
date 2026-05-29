import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        <CardTitle className="text-base">อัตราการชำระตามระดับชั้น</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {gradeStats.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            ยังไม่มีระดับชั้นหรือข้อมูลการชำระ
          </p>
        ) : (
          <div className="flex items-end gap-3 sm:gap-4" style={{ height: 200 }}>
            {gradeStats.map((item) => (
              <div
                key={item.grade}
                className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                title={`${item.grade}: ${item.paid}/${item.total} คน (${item.rate}%)`}
              >
                <span className="text-xs font-semibold tabular-nums text-primary">
                  {item.rate}%
                </span>
                <div className="flex w-full flex-1 items-end justify-center">
                  <div
                    className="w-[70%] rounded-t-md bg-gradient-to-b from-primary to-[#1f7a52] transition-[height] duration-500"
                    style={{ height: `${Math.max(item.rate, 2)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{item.grade}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

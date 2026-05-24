import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { gradeStats } from "@/lib/mock-data";

export function GradeStats() {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle>สถิติการชำระตามระดับชั้น</CardTitle>
        <CardDescription>
          ภาพรวมการชำระค่าเล่าเรียนแยกตามระดับชั้น ปีการศึกษา 2568 ภาค 1
        </CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}

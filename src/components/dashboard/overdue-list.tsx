import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBaht } from "@/lib/format";
import type { OverdueStudentRow } from "@/lib/data/dashboard";

export function OverdueList({ students }: { students: OverdueStudentRow[] }) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>ค้างชำระ</CardTitle>
            <CardDescription>ใบแจ้งชำระที่ยังไม่ครบจำนวน</CardDescription>
          </div>
          <Badge variant="secondary">{students.length} รายการ</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {students.length === 0 ? (
          <p className="text-sm text-muted-foreground">ไม่มีรายการค้างชำระ</p>
        ) : (
          students.map((student) => (
            <div
              key={student.id}
              className="flex items-center justify-between rounded-lg border border-border p-4"
            >
              <div>
                <p className="font-medium">{student.name}</p>
                <p className="text-sm text-muted-foreground">
                  {student.grade} • ออกใบ {student.dueDate}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{formatBaht(student.amount)}</p>
                {student.daysOverdue > 0 ? (
                  <Badge variant="outline" className="mt-1 border-amber-200 text-amber-700">
                    {student.daysOverdue} วัน
                  </Badge>
                ) : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

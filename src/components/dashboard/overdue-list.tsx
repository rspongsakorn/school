import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBaht, overdueStudents } from "@/lib/mock-data";

export function OverdueList() {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>ค้างชำระ</CardTitle>
            <CardDescription>รายการที่เกินกำหนดชำระ</CardDescription>
          </div>
          <Badge variant="secondary">{overdueStudents.length} รายการ</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {overdueStudents.map((student) => (
          <div
            key={student.name}
            className="flex items-center justify-between rounded-lg border border-border p-4"
          >
            <div>
              <p className="font-medium">{student.name}</p>
              <p className="text-sm text-muted-foreground">
                {student.grade} • กำหนด {student.dueDate}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums">{formatBaht(student.amount)}</p>
              <Badge variant="outline" className="mt-1 border-amber-200 text-amber-700">
                เกิน {student.daysOverdue} วัน
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReportsPage() {
  return (
    <>
      <AppHeader title="รายงาน" />
      <main className="p-6">
        <Card className="max-w-lg border-border">
          <CardHeader>
            <CardTitle>รายงานค้างชำระ</CardTitle>
            <CardDescription>กรองตามชั้น ห้อง สถานะ</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Generate หน้านี้ใน v0 แล้ว export มาแทนที่ — หรือให้ agent สร้างต่อจาก spec
          </CardContent>
        </Card>
      </main>
    </>
  );
}

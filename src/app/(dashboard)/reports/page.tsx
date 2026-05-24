import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPageHeaderProps } from "@/lib/data/page-header";

export default async function ReportsPage() {
  const header = await getPageHeaderProps();

  return (
    <>
      <AppHeader title="รายงาน" {...header} />
      <main className="p-6">
        <Card className="max-w-lg border-border">
          <CardHeader>
            <CardTitle>รายงานค้างชำระ</CardTitle>
            <CardDescription>กรองตามชั้น ห้อง สถานะ</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            สรุปค้างชำระแสดงบนแดชบอร์ดแล้ว — รายงานเต็มจะเพิ่มใน phase ถัดไป
          </CardContent>
        </Card>
      </main>
    </>
  );
}

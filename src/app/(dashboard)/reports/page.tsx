import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPageHeaderProps } from "@/lib/data/page-header";

type SearchParams = Promise<{ year?: string; semester?: string }>;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const header = await getPageHeaderProps("/reports", sp);

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

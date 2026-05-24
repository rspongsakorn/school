import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPageHeaderProps } from "@/lib/data/page-header";

type SearchParams = Promise<{ year?: string; semester?: string }>;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const header = await getPageHeaderProps("/payments", sp);

  return (
    <>
      <AppHeader title="บันทึกการจ่าย" {...header} />
      <main className="p-6">
        <Card className="max-w-lg border-border">
          <CardHeader>
            <CardTitle>บันทึกการจ่าย</CardTitle>
            <CardDescription>เคาน์เตอร์รับเงิน walk-in — ค้นหานักเรียน จัดสรร ออกใบเสร็จ</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            ข้อมูลชำระเงินเชื่อม Supabase แล้ว — UI ฟอร์มบันทึกจะเพิ่มใน phase ถัดไป
          </CardContent>
        </Card>
      </main>
    </>
  );
}

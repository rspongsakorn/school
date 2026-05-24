import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPageHeaderProps } from "@/lib/data/page-header";

export default async function InvoicesPage() {
  const header = await getPageHeaderProps();

  return (
    <>
      <AppHeader title="ใบแจ้งชำระ" {...header} />
      <main className="p-6">
        <Card className="max-w-lg border-border">
          <CardHeader>
            <CardTitle>ใบแจ้งชำระ</CardTitle>
            <CardDescription>สร้างและจัดการใบแจ้งชำระค่าเล่าเรียน</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            จัดการใน Supabase ตาราง student_invoices และ invoice_lines
          </CardContent>
        </Card>
      </main>
    </>
  );
}

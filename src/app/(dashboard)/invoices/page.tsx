import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function InvoicesPage() {
  return (
    <>
      <AppHeader title="ใบแจ้งชำระ" />
      <main className="p-6">
        <Card className="max-w-lg border-border">
          <CardHeader>
            <CardTitle>ใบแจ้งชำระ</CardTitle>
            <CardDescription>สร้างและจัดการใบแจ้งชำระค่าเล่าเรียน</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            หน้านี้จะเชื่อมกับ Supabase ใน phase ถัดไป
          </CardContent>
        </Card>
      </main>
    </>
  );
}

import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PaymentsPage() {
  return (
    <>
      <AppHeader title="บันทึกการจ่าย" />
      <main className="p-6">
        <Card className="max-w-lg border-border">
          <CardHeader>
            <CardTitle>บันทึกการจ่าย</CardTitle>
            <CardDescription>เคาน์เตอร์รับเงิน walk-in — ค้นหานักเรียน จัดสรร ออกใบเสร็จ</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Generate หน้านี้ใน v0 แล้ว export มาแทนที่ — หรือให้ agent สร้างต่อจาก spec
          </CardContent>
        </Card>
      </main>
    </>
  );
}

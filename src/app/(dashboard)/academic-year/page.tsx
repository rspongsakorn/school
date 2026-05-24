import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <>
      <AppHeader title={title} />
      <main className="p-6">
        <Card className="max-w-lg border-border">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            หน้านี้จะเชื่อมกับ Supabase ใน phase ถัดไป — UI shell จาก v0 พร้อมแล้ว
          </CardContent>
        </Card>
      </main>
    </>
  );
}

export default function AcademicYearPage() {
  return (
    <PlaceholderPage title="ปีการศึกษา" description="ตั้งค่าปีการศึกษาและภาคเรียน" />
  );
}

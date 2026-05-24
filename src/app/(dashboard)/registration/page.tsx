import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegistrationPage() {
  return (
    <>
      <AppHeader title="ลงทะเบียน" />
      <main className="p-6">
        <Card className="max-w-lg border-border">
          <CardHeader>
            <CardTitle>ลงทะเบียน</CardTitle>
            <CardDescription>ลงทะเบียนนักเรียนตามห้องเรียน</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            หน้านี้จะเชื่อมกับ Supabase ใน phase ถัดไป
          </CardContent>
        </Card>
      </main>
    </>
  );
}

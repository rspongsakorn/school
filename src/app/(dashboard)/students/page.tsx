import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function StudentsPage() {
  return (
    <>
      <AppHeader title="นักเรียน" />
      <main className="p-6">
        <Card className="max-w-lg border-border">
          <CardHeader>
            <CardTitle>นักเรียน</CardTitle>
            <CardDescription>จัดการข้อมูลนักเรียน</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            หน้านี้จะเชื่อมกับ Supabase ใน phase ถัดไป
          </CardContent>
        </Card>
      </main>
    </>
  );
}

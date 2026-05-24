import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPageHeaderProps } from "@/lib/data/page-header";

export default async function RegistrationPage() {
  const header = await getPageHeaderProps();

  return (
    <>
      <AppHeader title="ลงทะเบียน" {...header} />
      <main className="p-6">
        <Card className="max-w-lg border-border">
          <CardHeader>
            <CardTitle>ลงทะเบียน</CardTitle>
            <CardDescription>ลงทะเบียนนักเรียนตามห้องเรียน</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            จัดการใน Supabase ตาราง student_enrollments
          </CardContent>
        </Card>
      </main>
    </>
  );
}

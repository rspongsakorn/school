import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPageHeaderProps } from "@/lib/data/page-header";

export default async function AcademicYearPage() {
  const header = await getPageHeaderProps();

  return (
    <>
      <AppHeader title="ปีการศึกษา" {...header} />
      <main className="p-6">
        <Card className="max-w-lg border-border">
          <CardHeader>
            <CardTitle>ปีการศึกษา</CardTitle>
            <CardDescription>ตั้งค่าปีการศึกษาและภาคเรียน</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            จัดการใน Supabase ตาราง academic_years และ semesters
          </CardContent>
        </Card>
      </main>
    </>
  );
}

import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentProfile, getYearSemesterContext } from "@/lib/data/context";
import { listStudents } from "@/lib/data/students";

export default async function StudentsPage() {
  const [profile, context] = await Promise.all([
    getCurrentProfile(),
    getYearSemesterContext(),
  ]);
  const students = await listStudents(context?.academicYearId ?? null);

  return (
    <>
      <AppHeader
        title="นักเรียน"
        displayName={profile?.display_name ?? "ผู้ใช้"}
        yearName={context?.academicYearName}
        semesterNumber={context?.semesterNumber}
      />
      <main className="p-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>รายชื่อนักเรียน</CardTitle>
            <CardDescription>
              ข้อมูลจาก Supabase {students.length > 0 ? `(${students.length} คน)` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {students.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                ยังไม่มีนักเรียนในระบบ — เพิ่มข้อมูลในตาราง students
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>รหัส</TableHead>
                    <TableHead>ชื่อ-นามสกุล</TableHead>
                    <TableHead>ชั้น</TableHead>
                    <TableHead>สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium tabular-nums">
                        {student.studentCode}
                      </TableCell>
                      <TableCell>{student.name}</TableCell>
                      <TableCell>{student.grade}</TableCell>
                      <TableCell>{student.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

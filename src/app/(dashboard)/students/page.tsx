import { AppHeader } from "@/components/app-header";
import { StudentsPanel } from "@/components/students/students-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentProfileRole } from "@/lib/auth/require-admin";
import { getYearSemesterContext } from "@/lib/data/context";
import { listStudentsPaginated } from "@/lib/data/students";
import {
  STUDENT_STATUS_FILTER_OPTIONS,
  type StudentStatus,
} from "@/lib/students/constants";

type SearchParams = Promise<{ q?: string; status?: string; page?: string }>;

function parseStatus(value?: string): StudentStatus | "all" {
  if (!value) return "all";
  const isValid = STUDENT_STATUS_FILTER_OPTIONS.some((option) => option.value === value);
  return isValid ? (value as StudentStatus | "all") : "all";
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const [profile, context] = await Promise.all([
    getCurrentProfileRole(),
    getYearSemesterContext(),
  ]);
  const q = sp.q ?? "";
  const status = parseStatus(sp.status);
  const rawPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const students = await listStudentsPaginated({
    q,
    status,
    page,
    academicYearId: context?.academicYearId ?? null,
  });
  const isAdmin = profile?.role === "admin";

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
              {students.total > 0 ? `${students.total} คน` : "ยังไม่มีนักเรียนในระบบ"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StudentsPanel
              data={students}
              params={{ q, status, page }}
              isAdmin={isAdmin}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}

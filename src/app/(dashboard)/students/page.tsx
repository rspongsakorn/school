import { AppHeader } from "@/components/app-header";
import { StudentsPanel } from "@/components/students/students-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentProfileRole } from "@/lib/auth/require-admin";
import {
  buildHeaderContextProps,
  loadSemesterPageContext,
} from "@/lib/data/semester-page-context";
import { listStudentsPaginated } from "@/lib/data/students";
import {
  STUDENT_STATUS_FILTER_OPTIONS,
  type StudentStatus,
} from "@/lib/students/constants";

type SearchParams = Promise<{
  q?: string;
  status?: string;
  page?: string;
  year?: string;
  semester?: string;
}>;

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
  const [profile, page] = await Promise.all([
    getCurrentProfileRole(),
    loadSemesterPageContext(sp.year, sp.semester),
  ]);
  const q = sp.q ?? "";
  const status = parseStatus(sp.status);
  const rawPage = Number.parseInt(sp.page ?? "1", 10);
  const pageNum = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const students = await listStudentsPaginated({
    q,
    status,
    page: pageNum,
    semesterId: page.ctx?.semesterId ?? null,
  });
  const isAdmin = profile?.role === "admin";
  const headerContext = buildHeaderContextProps(page, "/students");

  return (
    <>
      <AppHeader
        title="นักเรียน"
        displayName={profile?.display_name ?? "ผู้ใช้"}
        showContextSelectors={Boolean(headerContext)}
        context={headerContext}
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
              params={{ q, status, page: pageNum }}
              isAdmin={isAdmin}
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}

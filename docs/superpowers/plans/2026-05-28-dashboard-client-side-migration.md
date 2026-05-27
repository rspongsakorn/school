# Dashboard Client-Side Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate 450-600ms RSC navigation latency by migrating all dashboard pages from server-heavy rendering to client-side SPA pattern using TanStack Query + Supabase browser client.

**Architecture:** Middleware does cookie-presence check only (no DB). AuthProvider fetches session+profile once per session mount. Every dashboard page becomes a thin shell; panels fetch their own data via TanStack Query using `createBrowserClient`. Navigation becomes instant client-side re-renders with cached data.

**Tech Stack:** Next.js App Router, Supabase SSR (`@supabase/ssr`), `@tanstack/react-query` (new), React Context

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `src/middleware.ts` | Cookie-presence guard (replaces proxy.ts) |
| `src/components/providers/auth-provider.tsx` | Session + profile React context |
| `src/components/providers/query-provider.tsx` | TanStack QueryClient wrapper |
| `src/hooks/use-semester-context.ts` | Client-side year/semester state from URL + DB |
| `src/lib/queries/context.ts` | Browser fetches: academic years + semesters |
| `src/lib/queries/dashboard.ts` | Browser fetch: dashboard data |
| `src/lib/queries/students.ts` | Browser fetch: students paginated |
| `src/lib/queries/academic-years.ts` | Browser fetch: academic years full detail |
| `src/lib/queries/fee-rates.ts` | Browser fetch: fee matrix + fee items |
| `src/lib/queries/invoices.ts` | Browser fetch: invoices paginated |
| `src/lib/queries/payments.ts` | Browser fetch: payments filtered |
| `src/lib/queries/receipt-types.ts` | Browser fetch: receipt types |
| `src/lib/queries/registration.ts` | Browser fetch: grade levels, classrooms, rosters |
| `src/lib/queries/reports.ts` | Browser fetch: outstanding + collections |

### Modified files
| File | Change |
|------|--------|
| `src/app/layout.tsx` | Wrap with QueryProvider + AuthProvider |
| `src/app/(dashboard)/layout.tsx` | "use client" + auth guard |
| `src/components/app-header.tsx` | Use useAuth() + useSemesterContext(); new props signature |
| `src/components/auth/user-menu.tsx` | Use useAuth() for displayName |
| `src/app/(dashboard)/page.tsx` | Thin shell |
| `src/app/(dashboard)/students/page.tsx` | Thin shell |
| `src/app/(dashboard)/academic-year/page.tsx` | Thin shell |
| `src/app/(dashboard)/academic-year/new/page.tsx` | Thin shell |
| `src/app/(dashboard)/academic-year/[id]/page.tsx` | Thin shell |
| `src/app/(dashboard)/fee-rates/page.tsx` | Thin shell |
| `src/app/(dashboard)/invoices/page.tsx` | Thin shell |
| `src/app/(dashboard)/payments/page.tsx` | Thin shell |
| `src/app/(dashboard)/receipt-types/page.tsx` | Thin shell |
| `src/app/(dashboard)/registration/page.tsx` | Thin shell |
| `src/app/(dashboard)/registration/setup/page.tsx` | Thin shell |
| `src/app/(dashboard)/reports/page.tsx` | Thin shell |
| `src/app/(dashboard)/reports/outstanding/page.tsx` | Thin shell |
| `src/app/(dashboard)/reports/collections/page.tsx` | Thin shell |
| `src/components/students/students-panel.tsx` | Remove props; use hooks + useQuery |
| All other panel components | Remove props; use hooks + useQuery |

### Deleted files
| File | Reason |
|------|--------|
| `src/proxy.ts` | Was never loaded as middleware; replaced by `src/middleware.ts` |

---

## Task 1: Install TanStack Query

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
npm install @tanstack/react-query
```

- [ ] **Step 2: Verify install**

```bash
npm ls @tanstack/react-query
```

Expected: `@tanstack/react-query@5.x.x` listed

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install @tanstack/react-query"
```

---

## Task 2: Create Middleware + Delete proxy.ts

**Files:**
- Create: `src/middleware.ts`
- Delete: `src/proxy.ts`

- [ ] **Step 1: Create `src/middleware.ts`**

```ts
import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!isAuthRoute) {
    // Check for any Supabase session cookie (cookie name starts with sb-)
    const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
```

- [ ] **Step 2: Delete `src/proxy.ts`**

```bash
git rm src/proxy.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add middleware cookie guard, remove unused proxy.ts"
```

---

## Task 3: Create AuthProvider

**Files:**
- Create: `src/components/providers/auth-provider.tsx`

- [ ] **Step 1: Create the provider**

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SessionProfile } from "@/lib/auth/session-profile";

type AuthState = {
  profile: SessionProfile | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthState>({ profile: null, isLoading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ profile: null, isLoading: true });

  const loadProfile = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setState({ profile: null, isLoading: false });
      router.push("/login");
      return;
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id, role, display_name, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profileRow?.is_active) {
      setState({ profile: null, isLoading: false });
      await supabase.auth.signOut();
      router.push("/login?error=inactive");
      return;
    }

    setState({
      profile: {
        id: profileRow.id,
        role: profileRow.role as SessionProfile["role"],
        display_name: profileRow.display_name,
        is_active: profileRow.is_active,
        email: user.email ?? "",
      },
      isLoading: false,
    });
  }, [router]);

  useEffect(() => {
    void loadProfile();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setState({ profile: null, isLoading: false });
        router.push("/login");
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void loadProfile();
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile, router]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useRequireRole(role: SessionProfile["role"] | SessionProfile["role"][]) {
  const { profile, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const roles = Array.isArray(role) ? role : [role];
    if (profile && !roles.includes(profile.role)) {
      router.push("/");
    }
  }, [profile, isLoading, role, router]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/providers/auth-provider.tsx
git commit -m "feat: add AuthProvider with useAuth and useRequireRole hooks"
```

---

## Task 4: Create QueryProvider

**Files:**
- Create: `src/components/providers/query-provider.tsx`

- [ ] **Step 1: Create the provider**

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60 * 1000,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/providers/query-provider.tsx
git commit -m "feat: add QueryProvider with 30s staleTime default"
```

---

## Task 5: Wire Providers into Root Layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update `src/app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/providers/auth-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  subsets: ["thai", "latin"],
});

export const metadata: Metadata = {
  title: "ระบบจัดการค่าเล่าเรียน | โรงเรียนตัวอย่างประถมศึกษา",
  description: "ระบบบริหารจัดการค่าเล่าเรียนและการเงินสำหรับโรงเรียน",
};

export const viewport: Viewport = {
  themeColor: "#1B6CA8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="bg-background">
      <body
        className={`${inter.variable} ${notoSansThai.variable} min-h-screen font-sans antialiased`}
      >
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: wire QueryProvider and AuthProvider into root layout"
```

---

## Task 6: Convert Dashboard Layout to Auth Guard

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Update layout**

```tsx
"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { AppSidebar } from "@/components/app-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="ml-[260px]">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/layout.tsx
git commit -m "feat: convert dashboard layout to client auth guard"
```

---

## Task 7: Create Browser Queries for Context (Years + Semesters)

**Files:**
- Create: `src/lib/queries/context.ts`

- [ ] **Step 1: Create the file**

```ts
import { createClient } from "@/lib/supabase/client";
import type { AcademicYearOption } from "@/lib/data/academic-years";
import type { SemesterOption } from "@/lib/context/semester-params";

export async function fetchAcademicYearOptions(): Promise<AcademicYearOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .select("id, name, is_active")
    .order("start_date", { ascending: false });
  if (error || !data) return [];
  return data;
}

export async function fetchSemestersForYears(yearIds: string[]): Promise<SemesterOption[]> {
  if (yearIds.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name")
    .in("academic_year_id", yearIds)
    .order("number", { ascending: true });
  if (error || !data) return [];
  return data.map((s) => ({
    id: s.id,
    academic_year_id: s.academic_year_id,
    number: s.number,
    name: s.name,
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/queries/context.ts
git commit -m "feat: add browser query functions for academic years and semesters"
```

---

## Task 8: Create useSemesterContext Hook

**Files:**
- Create: `src/hooks/use-semester-context.ts`

- [ ] **Step 1: Create the hook**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { fetchAcademicYearOptions, fetchSemestersForYears } from "@/lib/queries/context";
import { readSemesterCookieFromDocument } from "@/lib/context/semester-cookie";
import { resolveSemesterContext } from "@/lib/context/semester-params";
import type { AcademicYearOption } from "@/lib/data/academic-years";
import type { SemesterOption, SemesterContext } from "@/lib/context/semester-params";

export type SemesterContextResult = {
  years: AcademicYearOption[];
  semesters: SemesterOption[];
  ctx: SemesterContext | null;
  isLoading: boolean;
};

export function useSemesterContext(): SemesterContextResult {
  const searchParams = useSearchParams();
  const yearParam = searchParams.get("year") ?? undefined;
  const semesterParam = searchParams.get("semester") ?? undefined;

  const yearsQuery = useQuery({
    queryKey: ["academic-years"],
    queryFn: fetchAcademicYearOptions,
    staleTime: 60_000,
  });

  const years = yearsQuery.data ?? [];
  const yearIds = years.map((y) => y.id);

  const semestersQuery = useQuery({
    queryKey: ["semesters", yearIds],
    queryFn: () => fetchSemestersForYears(yearIds),
    enabled: yearIds.length > 0,
    staleTime: 60_000,
  });

  const semesters = semestersQuery.data ?? [];

  const cookie = readSemesterCookieFromDocument();
  const resolvedYear = yearParam ?? cookie.yearId ?? undefined;
  const resolvedSemester =
    semesterParam ?? (cookie.semesterNumber ? String(cookie.semesterNumber) : undefined);

  const ctx = resolveSemesterContext(resolvedYear, resolvedSemester, years, semesters);

  return {
    years,
    semesters,
    ctx,
    isLoading: yearsQuery.isLoading || (yearIds.length > 0 && semestersQuery.isLoading),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-semester-context.ts
git commit -m "feat: add useSemesterContext hook with TanStack Query + URL + cookie"
```

---

## Task 9: Refactor AppHeader + UserMenu to Use Hooks

`AppHeader` currently receives `displayName`, `yearName`, `semesterNumber`, `showContextSelectors`, and the full `context` object as props — all from server. After this task it reads those from hooks, and only needs `title` + optional `basePath`.

**Files:**
- Modify: `src/components/app-header.tsx`
- Modify: `src/components/auth/user-menu.tsx`

- [ ] **Step 1: Update `src/components/auth/user-menu.tsx`** — remove `displayName` prop, read from `useAuth()`

```tsx
"use client";

import { ChevronDown, User } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { useAuth } from "@/components/providers/auth-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const { profile } = useAuth();
  const displayName = profile?.display_name ?? "ผู้ใช้";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-muted">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="max-w-[140px] truncate text-sm font-medium">{displayName}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => { void signOut(); }}>
          ออกจากระบบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Update `src/components/app-header.tsx`** — new props: only `title` + optional `basePath` + optional `clearGradeClassroomOnChange`

```tsx
"use client";

import { useSemesterContext } from "@/hooks/use-semester-context";
import { UserMenu } from "@/components/auth/user-menu";
import { YearSemesterSelect } from "@/components/context/year-semester-select";

type AppHeaderProps = {
  title: string;
  basePath?: string;
  clearGradeClassroomOnChange?: boolean;
};

export function AppHeader({ title, basePath, clearGradeClassroomOnChange = false }: AppHeaderProps) {
  const { years, semesters, ctx } = useSemesterContext();

  const showSelectors = Boolean(basePath && ctx);
  const subtitleYear = ctx?.academicYearName;
  const subtitleSemester = ctx?.semesterNumber ?? 1;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {subtitleYear ? (
          <p className="text-xs text-muted-foreground">
            ภาคเรียนที่ {subtitleSemester} · ปี {subtitleYear}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-4">
        {showSelectors && ctx && basePath ? (
          <YearSemesterSelect
            years={years}
            semesters={semesters}
            selectedYearId={ctx.academicYearId}
            selectedSemesterNumber={ctx.semesterNumber}
            basePath={basePath}
            clearGradeClassroomOnChange={clearGradeClassroomOnChange}
          />
        ) : null}
        <UserMenu />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/app-header.tsx src/components/auth/user-menu.tsx
git commit -m "refactor: AppHeader and UserMenu read auth/context from hooks"
```

---

## Task 10: Dashboard Page — Browser Queries + Panel Migration

**Files:**
- Create: `src/lib/queries/dashboard.ts`
- Modify: `src/app/(dashboard)/page.tsx`
- Modify: `src/components/dashboard/stat-cards.tsx`
- Modify: `src/components/dashboard/recent-payments-table.tsx`
- Modify: `src/components/dashboard/overdue-list.tsx`
- Modify: `src/components/dashboard/grade-stats.tsx`

- [ ] **Step 1: Create `src/lib/queries/dashboard.ts`**

This replicates `getDashboardData` from `src/lib/data/dashboard.ts` using the browser client. The logic is identical — only the `createClient` import changes.

```ts
import { createClient } from "@/lib/supabase/client";
import { formatStudentName, formatThaiDate } from "@/lib/format";
import type {
  DashboardData,
  DashboardStats,
  GradeStatRow,
  OverdueStudentRow,
  RecentPaymentRow,
} from "@/lib/data/dashboard";
import type { YearSemesterContext } from "@/lib/data/context";

export type { DashboardData, DashboardStats, GradeStatRow, OverdueStudentRow, RecentPaymentRow };

const emptyStats: DashboardStats = {
  totalStudents: 0,
  totalCollected: 0,
  paidCount: 0,
  paidRate: 0,
  overdueCount: 0,
  overdueAmount: 0,
};

async function getStudentNameMap(studentIds: string[]): Promise<Map<string, string>> {
  if (studentIds.length === 0) return new Map();
  const supabase = createClient();
  const { data } = await supabase
    .from("students")
    .select("id, first_name, last_name")
    .in("id", studentIds);
  const map = new Map<string, string>();
  for (const s of data ?? []) map.set(s.id, formatStudentName(s.first_name, s.last_name));
  return map;
}

async function getStudentGradeMap(semesterId: string): Promise<Map<string, string>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("student_enrollments")
    .select("student_id, classrooms(name, grade_levels(name))")
    .eq("semester_id", semesterId)
    .eq("status", "enrolled");

  const map = new Map<string, string>();
  for (const row of (data ?? []) as unknown as {
    student_id: string;
    classrooms: { name: string; grade_levels: { name: string } | null } | null;
  }[]) {
    const grade = row.classrooms?.grade_levels?.name ?? null;
    const classroom = row.classrooms?.name ?? null;
    if (grade && classroom) map.set(row.student_id, `${grade}/${classroom}`);
    else if (grade) map.set(row.student_id, grade);
  }
  return map;
}

export async function fetchDashboardData(context: YearSemesterContext | null): Promise<DashboardData> {
  if (!context) {
    return { context: null, stats: emptyStats, recentPayments: [], overdueStudents: [], gradeStats: [] };
  }

  const supabase = createClient();
  const { academicYearId, semesterId } = context;
  const gradeByStudent = await getStudentGradeMap(semesterId);

  const [enrollmentsRes, invoicesRes, paymentsRes, recentPaymentsRes, overdueRes, gradeLevelsRes] =
    await Promise.all([
      supabase
        .from("student_enrollments")
        .select("student_id", { count: "exact", head: true })
        .eq("semester_id", semesterId)
        .eq("status", "enrolled"),
      supabase
        .from("student_invoices")
        .select("student_id, total_amount, paid_amount, status")
        .eq("academic_year_id", academicYearId)
        .eq("semester_id", semesterId),
      supabase
        .from("payments")
        .select("amount")
        .eq("academic_year_id", academicYearId)
        .eq("status", "active"),
      supabase
        .from("payments")
        .select("receipt_number, amount, paid_at, student_id")
        .eq("academic_year_id", academicYearId)
        .eq("status", "active")
        .order("paid_at", { ascending: false })
        .limit(5),
      supabase
        .from("student_invoices")
        .select("id, student_id, total_amount, paid_amount, created_at")
        .eq("academic_year_id", academicYearId)
        .eq("semester_id", semesterId)
        .in("status", ["unpaid", "partial"])
        .order("created_at", { ascending: true })
        .limit(10),
      supabase
        .from("grade_levels")
        .select("id, name, sort_order")
        .eq("semester_id", semesterId)
        .order("sort_order", { ascending: true }),
    ]);

  const invoices = invoicesRes.data ?? [];
  const totalStudents = enrollmentsRes.count ?? 0;
  const totalCollected = (paymentsRes.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const paidCount = invoices.filter((i) => i.status === "paid").length;
  const paidRate = invoices.length > 0 ? Math.round((paidCount / invoices.length) * 1000) / 10 : 0;
  const overdueInvoices = invoices.filter((i) => i.status === "unpaid" || i.status === "partial");
  const overdueAmount = overdueInvoices.reduce(
    (sum, i) => sum + (Number(i.total_amount) - Number(i.paid_amount)),
    0,
  );

  const recentRows = recentPaymentsRes.data ?? [];
  const overdueRows = overdueRes.data ?? [];
  const studentIds = [...new Set([...recentRows.map((r) => r.student_id), ...overdueRows.map((r) => r.student_id)])];
  const nameByStudent = await getStudentNameMap(studentIds);

  const recentPayments: RecentPaymentRow[] = recentRows.map((row) => ({
    id: row.receipt_number,
    name: nameByStudent.get(row.student_id) ?? "—",
    grade: gradeByStudent.get(row.student_id) ?? "—",
    amount: Number(row.amount),
    date: formatThaiDate(row.paid_at),
    status: "ชำระแล้ว",
  }));

  const now = Date.now();
  const overdueStudents: OverdueStudentRow[] = overdueRows.map((row) => {
    const outstanding = Number(row.total_amount) - Number(row.paid_amount);
    const created = new Date(row.created_at);
    const daysOverdue = Math.max(0, Math.floor((now - created.getTime()) / 86_400_000));
    return {
      id: row.id,
      name: nameByStudent.get(row.student_id) ?? "—",
      grade: gradeByStudent.get(row.student_id) ?? "—",
      dueDate: formatThaiDate(created),
      amount: outstanding,
      daysOverdue,
    };
  });

  const gradeLevels = gradeLevelsRes.data ?? [];
  const gradeStats: GradeStatRow[] = await Promise.all(
    gradeLevels.map(async (gl) => {
      const { data: classrooms } = await supabase
        .from("classrooms")
        .select("id")
        .eq("grade_level_id", gl.id)
        .eq("semester_id", semesterId);
      const classroomIds = (classrooms ?? []).map((c) => c.id);
      if (classroomIds.length === 0) return { grade: gl.name, rate: 0, paid: 0, total: 0 };
      const { data: enrollments } = await supabase
        .from("student_enrollments")
        .select("student_id")
        .eq("semester_id", semesterId)
        .eq("status", "enrolled")
        .in("classroom_id", classroomIds);
      const studentIdsForGrade = (enrollments ?? []).map((e) => e.student_id);
      const total = studentIdsForGrade.length;
      if (total === 0) return { grade: gl.name, rate: 0, paid: 0, total: 0 };
      const { data: gradeInvoices } = await supabase
        .from("student_invoices")
        .select("status")
        .eq("academic_year_id", academicYearId)
        .eq("semester_id", semesterId)
        .in("student_id", studentIdsForGrade);
      const paid = (gradeInvoices ?? []).filter((i) => i.status === "paid").length;
      return { grade: gl.name, rate: Math.round((paid / total) * 1000) / 10, paid, total };
    }),
  );

  return {
    context,
    stats: { totalStudents, totalCollected, paidCount, paidRate, overdueCount: overdueInvoices.length, overdueAmount },
    recentPayments,
    overdueStudents,
    gradeStats,
  };
}
```

- [ ] **Step 2: Convert `src/app/(dashboard)/page.tsx` to thin shell**

```tsx
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

export default function DashboardPage() {
  return <DashboardOverview />;
}
```

- [ ] **Step 3: Create `src/components/dashboard/dashboard-overview.tsx`**

This new component replaces the server logic in the old `page.tsx`, using hooks + useQuery.

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchDashboardData } from "@/lib/queries/dashboard";
import { StatCards } from "@/components/dashboard/stat-cards";
import { RecentPaymentsTable } from "@/components/dashboard/recent-payments-table";
import { OverdueList } from "@/components/dashboard/overdue-list";
import { GradeStats } from "@/components/dashboard/grade-stats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardOverview() {
  const { ctx, isLoading: ctxLoading } = useSemesterContext();

  const { data: dashboard, isLoading: dataLoading } = useQuery({
    queryKey: ["dashboard", ctx?.semesterId, ctx?.academicYearId],
    queryFn: () => fetchDashboardData(ctx ?? null),
    enabled: !ctxLoading,
    staleTime: 30_000,
  });

  const isLoading = ctxLoading || dataLoading;

  return (
    <>
      <AppHeader title="ภาพรวม" basePath="/" />
      <main className="p-6">
        {!ctx && !ctxLoading ? (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="text-base">ยังไม่มีปีการศึกษา</CardTitle>
              <CardDescription>
                สร้างปีการศึกษาและภาคเรียนใน Supabase (ตาราง academic_years, semesters)
                แล้วตั้ง is_active = true
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              แดชบอร์ดจะแสดงข้อมูลจริงเมื่อมีปีการศึกษาที่ใช้งานอยู่
            </CardContent>
          </Card>
        ) : null}
        {isLoading ? (
          <div className="space-y-6">
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
            <div className="h-48 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : dashboard ? (
          <div className="space-y-6">
            <StatCards stats={dashboard.stats} />
            <RecentPaymentsTable payments={dashboard.recentPayments} />
            <div className="grid gap-6 lg:grid-cols-2">
              <OverdueList students={dashboard.overdueStudents} />
              <GradeStats
                gradeStats={dashboard.gradeStats}
                yearName={ctx?.academicYearName}
                semesterNumber={ctx?.semesterNumber}
              />
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/dashboard.ts src/app/(dashboard)/page.tsx src/components/dashboard/dashboard-overview.tsx
git commit -m "feat: migrate dashboard page to client-side with TanStack Query"
```

---

## Task 11: Students Page — Browser Queries + Panel Migration

**Files:**
- Create: `src/lib/queries/students.ts`
- Modify: `src/app/(dashboard)/students/page.tsx`
- Modify: `src/components/students/students-panel.tsx`

- [ ] **Step 1: Create `src/lib/queries/students.ts`**

```ts
import { createClient } from "@/lib/supabase/client";
import { formatStudentName } from "@/lib/format";
import { buildStudentSearchOrFilter } from "@/lib/students/search";
import {
  STUDENT_STATUS_LABELS,
  STUDENTS_PAGE_SIZE,
  type StudentGender,
  type StudentStatus,
} from "@/lib/students/constants";
import type { PaginatedStudents, StudentListRow, StudentListParams } from "@/lib/data/students";

export type { PaginatedStudents, StudentListRow, StudentListParams };

async function fetchStudentGradeMap(semesterId: string): Promise<Map<string, string>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("student_enrollments")
    .select("student_id, classrooms(name, grade_levels(name))")
    .eq("semester_id", semesterId)
    .eq("status", "enrolled");

  const map = new Map<string, string>();
  for (const row of (data ?? []) as unknown as {
    student_id: string;
    classrooms: { name: string; grade_levels: { name: string } | null } | null;
  }[]) {
    const grade = row.classrooms?.grade_levels?.name ?? null;
    const classroom = row.classrooms?.name ?? null;
    if (grade && classroom) map.set(row.student_id, `${grade}/${classroom}`);
    else if (grade) map.set(row.student_id, grade);
  }
  return map;
}

async function fetchBlockedStudentIds(studentIds: string[]): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();
  const supabase = createClient();
  const [enrollments, invoices, payments] = await Promise.all([
    supabase.from("student_enrollments").select("student_id").in("student_id", studentIds),
    supabase.from("student_invoices").select("student_id").in("student_id", studentIds),
    supabase.from("payments").select("student_id").in("student_id", studentIds).eq("status", "active"),
  ]);
  const blocked = new Set<string>();
  for (const r of enrollments.data ?? []) blocked.add(r.student_id);
  for (const r of invoices.data ?? []) blocked.add(r.student_id);
  for (const r of payments.data ?? []) blocked.add(r.student_id);
  return blocked;
}

export async function fetchStudentsPaginated(params: StudentListParams): Promise<PaginatedStudents> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = STUDENTS_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = createClient();
  const q = params.q?.trim();
  const searchFilter = q ? buildStudentSearchOrFilter(q) : "";

  const gradePromise = params.semesterId
    ? fetchStudentGradeMap(params.semesterId)
    : Promise.resolve(new Map<string, string>());

  const studentsPromise = (async () => {
    let query = supabase
      .from("students")
      .select("id, student_code, first_name, last_name, id_card, gender, date_of_birth, status", {
        count: "exact",
      })
      .order("student_code", { ascending: true });
    if (searchFilter) query = query.or(searchFilter);
    if (params.status && params.status !== "all") query = query.eq("status", params.status);
    return query.range(from, to);
  })();

  const [{ data: students, count, error }, gradeByStudent] = await Promise.all([
    studentsPromise,
    gradePromise,
  ]);

  if (error || !students) return { rows: [], total: 0, page, pageSize, totalPages: 0 };

  const studentIds = students.map((s) => s.id);
  const blockedStudentIds = await fetchBlockedStudentIds(studentIds);

  const rows: StudentListRow[] = students.map((s) => {
    const statusRaw = s.status as StudentStatus;
    return {
      id: s.id,
      studentCode: s.student_code,
      name: formatStudentName(s.first_name, s.last_name),
      idCard: s.id_card,
      grade: gradeByStudent.get(s.id) ?? "—",
      status: STUDENT_STATUS_LABELS[statusRaw] ?? s.status,
      statusRaw,
      firstName: s.first_name,
      lastName: s.last_name,
      gender: (s.gender as StudentGender | null) ?? null,
      dateOfBirth: s.date_of_birth ?? null,
      deletable: !blockedStudentIds.has(s.id),
    };
  });

  const total = count ?? 0;
  return { rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
```

- [ ] **Step 2: Convert `src/app/(dashboard)/students/page.tsx` to thin shell**

```tsx
import { StudentsPanel } from "@/components/students/students-panel";

export default function StudentsPage() {
  return <StudentsPanel />;
}
```

- [ ] **Step 3: Update `src/components/students/students-panel.tsx`** — remove props, add hooks + useQuery

Remove the `StudentsPanelProps` type and add hooks at the top of the component. The existing URL navigation logic (`pushParams`, `router.push`) already works via `useRouter`/`usePathname` — keep it. Add `useQuery` for data and `useAuth` + `useSemesterContext` for context.

Replace the top of `students-panel.tsx` from:
```tsx
// OLD — remove these lines
type StudentsPanelProps = {
  data: PaginatedStudents;
  params: { q: string; status: string; page: number };
  isAdmin: boolean;
};

export function StudentsPanel({ data, params, isAdmin }: StudentsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
```
with:
```tsx
// NEW — add these imports at top of file
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchStudentsPaginated } from "@/lib/queries/students";
import { AppHeader } from "@/components/app-header";
// ... keep all existing imports

export function StudentsPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const rawSearchParams = useSearchParams();
  const { profile } = useAuth();
  const { ctx } = useSemesterContext();
  const isAdmin = profile?.role === "admin";

  const q = rawSearchParams.get("q") ?? "";
  const status = parseStatus(rawSearchParams.get("status") ?? undefined);
  const rawPage = Number.parseInt(rawSearchParams.get("page") ?? "1", 10);
  const pageNum = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const params = { q, status, page: pageNum };

  const { data, isLoading } = useQuery({
    queryKey: ["students", ctx?.semesterId ?? null, q, status, pageNum],
    queryFn: () =>
      fetchStudentsPaginated({ q, status, page: pageNum, semesterId: ctx?.semesterId ?? null }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
```

Also add `AppHeader` render at the top of the JSX return (before the existing `<div>`):

```tsx
  return (
    <>
      <AppHeader title="นักเรียน" basePath="/students" />
      <main className="p-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>รายชื่อนักเรียน</CardTitle>
            <CardDescription>
              {data && data.total > 0 ? `${data.total} คน` : isLoading ? "กำลังโหลด..." : "ยังไม่มีนักเรียนในระบบ"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !data ? (
              <div className="h-40 animate-pulse rounded-lg bg-muted" />
            ) : data ? (
              // existing table JSX — replace `data` and `params` references with the hook-derived variables
              <div ...> ...existing table content... </div>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </>
  );
```

Add missing imports at top of file:
```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
```

Note: `parseStatus` function stays as-is (pure function, already in the file or move to top of file if currently in the page). Add it to the top of `students-panel.tsx`:
```tsx
function parseStatus(value?: string): StudentStatus | "all" {
  if (!value) return "all";
  const isValid = STUDENT_STATUS_FILTER_OPTIONS.some((option) => option.value === value);
  return isValid ? (value as StudentStatus | "all") : "all";
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/students.ts src/app/(dashboard)/students/page.tsx src/components/students/students-panel.tsx
git commit -m "feat: migrate students page to client-side with TanStack Query"
```

---

## Task 12: Academic Year Pages — Browser Queries + Panel Migration

**Files:**
- Create: `src/lib/queries/academic-years.ts`
- Modify: `src/app/(dashboard)/academic-year/page.tsx`
- Modify: `src/app/(dashboard)/academic-year/new/page.tsx`
- Modify: `src/app/(dashboard)/academic-year/[id]/page.tsx`
- Modify: `src/components/academic-year/academic-year-panel.tsx`
- Modify: `src/components/academic-year/academic-year-form-page.tsx`

- [ ] **Step 1: Create `src/lib/queries/academic-years.ts`**

```ts
import { createClient } from "@/lib/supabase/client";
import type { AcademicYearRow } from "@/lib/data/academic-years";

export type { AcademicYearRow };

export async function fetchAcademicYears(): Promise<AcademicYearRow[]> {
  const supabase = createClient();
  const { data: years, error } = await supabase
    .from("academic_years")
    .select("id, name, start_date, end_date, is_active")
    .order("start_date", { ascending: false });
  if (error || !years) return [];

  const yearIds = years.map((y) => y.id);
  const { data: semesters } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name, start_date, end_date")
    .in("academic_year_id", yearIds)
    .order("number", { ascending: true });

  return years.map((y) => ({
    ...y,
    semesters: (semesters ?? [])
      .filter((s) => s.academic_year_id === y.id)
      .map((s) => ({
        id: s.id,
        number: s.number,
        name: s.name,
        start_date: s.start_date,
        end_date: s.end_date,
      })),
  }));
}

export async function fetchAcademicYearById(id: string): Promise<AcademicYearRow | null> {
  const supabase = createClient();
  const { data: year, error } = await supabase
    .from("academic_years")
    .select("id, name, start_date, end_date, is_active")
    .eq("id", id)
    .maybeSingle();
  if (error || !year) return null;

  const { data: semesters } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name, start_date, end_date")
    .eq("academic_year_id", id)
    .order("number", { ascending: true });

  return {
    ...year,
    semesters: (semesters ?? []).map((s) => ({
      id: s.id,
      number: s.number,
      name: s.name,
      start_date: s.start_date,
      end_date: s.end_date,
    })),
  };
}
```

- [ ] **Step 2: Convert `src/app/(dashboard)/academic-year/page.tsx`**

Add `useRequireRole('admin')` inside the panel component (see Step 4). The page shell:

```tsx
import { AcademicYearPanel } from "@/components/academic-year/academic-year-panel";

export default function AcademicYearPage() {
  return <AcademicYearPanel />;
}
```

- [ ] **Step 3: Convert `src/app/(dashboard)/academic-year/new/page.tsx`**

Look at the current file — if it just renders a form with no server data, it can simply render the form component. Check what it currently does, then make it a thin shell.

```tsx
import { AcademicYearFormPage } from "@/components/academic-year/academic-year-form-page";

export default function NewAcademicYearPage() {
  return <AcademicYearFormPage mode="create" />;
}
```

- [ ] **Step 4: Convert `src/app/(dashboard)/academic-year/[id]/page.tsx`**

```tsx
import { EditAcademicYearPage } from "@/components/academic-year/edit-academic-year-page";

export default function AcademicYearEditPage({ params }: { params: Promise<{ id: string }> }) {
  return <EditAcademicYearPageWrapper params={params} />;
}
```

Because we need the `id` param client-side, create a thin wrapper. Actually, since `params` from Next.js dynamic routes is available as a Promise on server and as an object in client, the simpler approach is to pass `id` as a prop from a server component:

```tsx
// src/app/(dashboard)/academic-year/[id]/page.tsx
import { EditAcademicYearWrapper } from "@/components/academic-year/edit-academic-year-wrapper";

export default async function AcademicYearEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditAcademicYearWrapper id={id} />;
}
```

Then create `src/components/academic-year/edit-academic-year-wrapper.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { useRequireRole } from "@/components/providers/auth-provider";
import { fetchAcademicYearById } from "@/lib/queries/academic-years";
import { AcademicYearFormPage } from "@/components/academic-year/academic-year-form-page";
import { AppHeader } from "@/components/app-header";

export function EditAcademicYearWrapper({ id }: { id: string }) {
  useRequireRole("admin");

  const { data: year, isLoading, isError } = useQuery({
    queryKey: ["academic-year", id],
    queryFn: () => fetchAcademicYearById(id),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <>
        <AppHeader title="แก้ไขปีการศึกษา" />
        <main className="p-6"><div className="h-40 animate-pulse rounded-lg bg-muted" /></main>
      </>
    );
  }

  if (isError || !year) return notFound();

  return (
    <>
      <AppHeader title="แก้ไขปีการศึกษา" />
      <main className="p-6">
        <AcademicYearFormPage mode="edit" year={year} />
      </main>
    </>
  );
}
```

- [ ] **Step 5: Update `src/components/academic-year/academic-year-panel.tsx`** — add `"use client"`, `useQuery`, `useRequireRole`, `AppHeader`

At the top of the file:
```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useRequireRole } from "@/components/providers/auth-provider";
import { fetchAcademicYears } from "@/lib/queries/academic-years";
import { AppHeader } from "@/components/app-header";
// ... keep existing imports
```

Inside `AcademicYearPanel()` function (no props):
```tsx
export function AcademicYearPanel() {
  useRequireRole("admin");
  const { data: years = [], isLoading } = useQuery({
    queryKey: ["academic-years-full"],
    queryFn: fetchAcademicYears,
    staleTime: 30_000,
  });

  return (
    <>
      <AppHeader title="ปีการศึกษา" />
      <main className="p-6">
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        ) : (
          // existing JSX that currently uses `years` prop — now uses the `years` from useQuery
          <YearTable years={years} />
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 6: Update `src/components/academic-year/academic-year-form-page.tsx`** — if it references `AppHeader`, remove those references (parent now owns the header); also ensure `"use client"` is present

- [ ] **Step 7: Commit**

```bash
git add src/lib/queries/academic-years.ts \
  src/app/(dashboard)/academic-year/page.tsx \
  src/app/(dashboard)/academic-year/new/page.tsx \
  "src/app/(dashboard)/academic-year/[id]/page.tsx" \
  src/components/academic-year/
git commit -m "feat: migrate academic-year pages to client-side"
```

---

## Task 13: Fee Rates Page — Browser Queries + Panel Migration

**Files:**
- Create: `src/lib/queries/fee-rates.ts`
- Modify: `src/app/(dashboard)/fee-rates/page.tsx`
- Modify: `src/components/finance/fee-rates-matrix.tsx` (or wrapping panel)
- Modify: `src/components/finance/fee-items-section.tsx`

- [ ] **Step 1: Create `src/lib/queries/fee-rates.ts`**

Look up what `getFeeRateMatrix` and `listFeeItems` return from `src/lib/data/fee-rates.ts` and `src/lib/data/fee-items.ts`. Replicate with browser client:

```ts
import { createClient } from "@/lib/supabase/client";

export type FeeItem = {
  id: string;
  name: string;
  sort_order: number;
};

export type FeeRateMatrix = {
  grades: { id: string; name: string }[];
  items: FeeItem[];
  rates: Record<string, Record<string, number | null>>;
};

export async function fetchFeeItems(): Promise<FeeItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("fee_items")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data;
}

export async function fetchFeeRateMatrix(semesterId: string): Promise<FeeRateMatrix> {
  const supabase = createClient();
  const [{ data: grades }, { data: items }, { data: rates }] = await Promise.all([
    supabase
      .from("grade_levels")
      .select("id, name, sort_order")
      .eq("semester_id", semesterId)
      .order("sort_order", { ascending: true }),
    supabase.from("fee_items").select("id, name, sort_order").order("sort_order", { ascending: true }),
    supabase.from("fee_rates").select("grade_level_id, fee_item_id, amount").eq("semester_id", semesterId),
  ]);

  const rateMap: Record<string, Record<string, number | null>> = {};
  for (const r of rates ?? []) {
    if (!rateMap[r.grade_level_id]) rateMap[r.grade_level_id] = {};
    rateMap[r.grade_level_id][r.fee_item_id] = Number(r.amount);
  }

  return {
    grades: (grades ?? []).map((g) => ({ id: g.id, name: g.name })),
    items: (items ?? []).map((i) => ({ id: i.id, name: i.name, sort_order: i.sort_order })),
    rates: rateMap,
  };
}
```

- [ ] **Step 2: Convert `src/app/(dashboard)/fee-rates/page.tsx`** to thin shell

```tsx
import { FeeRatesPagePanel } from "@/components/finance/fee-rates-page-panel";

export default function FeeRatesPage() {
  return <FeeRatesPagePanel />;
}
```

- [ ] **Step 3: Create `src/components/finance/fee-rates-page-panel.tsx`**

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchFeeRateMatrix, fetchFeeItems } from "@/lib/queries/fee-rates";
import { FeeItemsSection } from "@/components/finance/fee-items-section";
import { FeeRatesMatrix } from "@/components/finance/fee-rates-matrix";

export function FeeRatesPagePanel() {
  useRequireRole("admin");
  const { ctx, isLoading: ctxLoading } = useSemesterContext();

  const { data: feeItems = [] } = useQuery({
    queryKey: ["fee-items"],
    queryFn: fetchFeeItems,
    staleTime: 60_000,
  });

  const { data: matrix, isLoading: matrixLoading } = useQuery({
    queryKey: ["fee-rate-matrix", ctx?.semesterId],
    queryFn: () => fetchFeeRateMatrix(ctx!.semesterId),
    enabled: Boolean(ctx?.semesterId),
    staleTime: 30_000,
  });

  const isLoading = ctxLoading || matrixLoading;

  return (
    <>
      <AppHeader title="ตั้งค่าค่าธรรมเนียม" basePath="/fee-rates" />
      <main className="space-y-6 p-6">
        {!ctx && !ctxLoading ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษา/ภาคเรียนในระบบ</p>
        ) : isLoading ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        ) : ctx && matrix ? (
          <>
            <FeeItemsSection items={feeItems} />
            <FeeRatesMatrix semesterId={ctx.semesterId} matrix={matrix} />
          </>
        ) : null}
      </main>
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/fee-rates.ts src/app/(dashboard)/fee-rates/page.tsx src/components/finance/fee-rates-page-panel.tsx
git commit -m "feat: migrate fee-rates page to client-side"
```

---

## Task 14: Invoices Page — Browser Queries + Panel Migration

**Files:**
- Create: `src/lib/queries/invoices.ts`
- Modify: `src/app/(dashboard)/invoices/page.tsx`
- Modify: `src/components/finance/invoices-panel.tsx`

- [ ] **Step 1a: Create `src/lib/queries/classrooms.ts`** (shared by invoices, payments, registration, reports)

```ts
import { createClient } from "@/lib/supabase/client";

export type GradeLevel = { id: string; name: string; sort_order: number };
export type Classroom = { id: string; name: string; grade_level_id: string };

export async function fetchGradeLevels(semesterId: string): Promise<GradeLevel[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("grade_levels")
    .select("id, name, sort_order")
    .eq("semester_id", semesterId)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data;
}

export async function fetchClassroomsBySemester(semesterId: string): Promise<Classroom[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, name, grade_level_id")
    .eq("semester_id", semesterId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data;
}

export async function fetchClassroomsByGrade(gradeLevelId: string): Promise<Classroom[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, name, grade_level_id")
    .eq("grade_level_id", gradeLevelId)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data;
}
```

- [ ] **Step 1b: Create `src/lib/queries/invoices.ts`**

Open `src/lib/data/invoices.ts` and copy the type exports and query logic. Change only:
- `import { createClient } from "@/lib/supabase/server"` → `import { createClient } from "@/lib/supabase/client"`
- Remove `await` before `createClient()` (browser client is synchronous)
- Export the same types: `InvoiceStatus`, `InvoiceListRow`, `PaginatedInvoices`, `InvoiceCandidate`
- Export functions: `fetchInvoicesPaginated` (same logic as `listInvoicesPaginated`) and `fetchInvoiceCandidates` (same logic as `listInvoiceCandidates`)

The key structural change — server version:
```ts
// server (src/lib/data/invoices.ts)
const supabase = await createClient();
```
Browser version:
```ts
// browser (src/lib/queries/invoices.ts)
const supabase = createClient();
```

Everything else (query chains, filters, pagination, type mapping) is identical.

- [ ] **Step 2: Convert `src/app/(dashboard)/invoices/page.tsx`** to thin shell

```tsx
import { InvoicesPanel } from "@/components/finance/invoices-panel";

export default function InvoicesPage() {
  return <InvoicesPanel />;
}
```

- [ ] **Step 3: Update `src/components/finance/invoices-panel.tsx`** — remove all props, add `"use client"`, use `useSemesterContext`, `useSearchParams`, `useQuery`, `useRequireRole`, `AppHeader`

The panel reads `q`, `status`, `grade`, `classroom`, `page` from `useSearchParams()`. Fetches data with `useQuery`. Shows `AppHeader` with `basePath="/invoices"`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/invoices.ts src/lib/queries/classrooms.ts \
  src/app/(dashboard)/invoices/page.tsx src/components/finance/invoices-panel.tsx
git commit -m "feat: migrate invoices page to client-side"
```

---

## Task 15: Payments Page — Browser Queries + Panel Migration

**Files:**
- Create: `src/lib/queries/payments.ts`
- Modify: `src/app/(dashboard)/payments/page.tsx`
- Modify: `src/components/finance/payments-panel.tsx`

- [ ] **Step 1: Create `src/lib/queries/payments.ts`**

Open `src/lib/data/payments.ts`. Copy types and `listPaymentsFiltered` logic. Change only `createClient` import and remove `await` before `createClient()`. Export as `fetchPaymentsFiltered` with the same parameter types.

```ts
import { createClient } from "@/lib/supabase/client";
// Copy type exports from src/lib/data/payments.ts verbatim
// Rename listPaymentsFiltered → fetchPaymentsFiltered
// Only change: `const supabase = createClient()` (no await)
```

- [ ] **Step 2: Convert `src/app/(dashboard)/payments/page.tsx`** to thin shell

```tsx
import { PaymentsPanel } from "@/components/finance/payments-panel";

export default function PaymentsPage() {
  return <PaymentsPanel />;
}
```

- [ ] **Step 3: Update `src/components/finance/payments-panel.tsx`** — remove props, add hooks, `useQuery`, `AppHeader` with `basePath="/payments"`. Role guard: `useRequireRole(["admin","finance"])`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/payments.ts src/app/(dashboard)/payments/page.tsx src/components/finance/payments-panel.tsx
git commit -m "feat: migrate payments page to client-side"
```

---

## Task 16: Receipt Types Page — Browser Query + Panel Migration

**Files:**
- Create: `src/lib/queries/receipt-types.ts`
- Modify: `src/app/(dashboard)/receipt-types/page.tsx`
- Modify: `src/components/finance/receipt-types-panel.tsx`

- [ ] **Step 1: Create `src/lib/queries/receipt-types.ts`**

Read `src/lib/data/receipt-types.ts` for `listReceiptTypes` — rewrite with browser client.

```ts
import { createClient } from "@/lib/supabase/client";

export async function fetchReceiptTypes() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("receipt_types")
    .select("id, name, is_active")
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data;
}
```

- [ ] **Step 2: Convert `src/app/(dashboard)/receipt-types/page.tsx`** to thin shell

```tsx
import { ReceiptTypesPanel } from "@/components/finance/receipt-types-panel";

export default function ReceiptTypesPage() {
  return <ReceiptTypesPanel />;
}
```

- [ ] **Step 3: Update `src/components/finance/receipt-types-panel.tsx`** — remove `types` prop, add `"use client"`, `useRequireRole("admin")`, `useQuery`, `AppHeader` with no `basePath` (no semester selector needed).

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/receipt-types.ts src/app/(dashboard)/receipt-types/page.tsx src/components/finance/receipt-types-panel.tsx
git commit -m "feat: migrate receipt-types page to client-side"
```

---

## Task 17: Registration Pages — Browser Queries + Panel Migration

**Files:**
- Create: `src/lib/queries/registration.ts`
- Modify: `src/app/(dashboard)/registration/page.tsx`
- Modify: `src/app/(dashboard)/registration/setup/page.tsx`
- Modify: `src/components/registration/registration-panel.tsx`

- [ ] **Step 1: Create `src/lib/queries/registration.ts`**

Open `src/lib/data/enrollments.ts` and `src/lib/data/semesters.ts`. Copy the types and three functions. Change only `createClient` import and remove `await` before `createClient()`.

```ts
import { createClient } from "@/lib/supabase/client";
// Copy from src/lib/data/enrollments.ts:
//   types: EnrollmentRosterRow, StudentEnrollmentCandidate
//   rename listClassroomRoster → fetchClassroomRoster
//   rename listStudentsAvailableForEnrollment → fetchEnrollmentCandidates
// Copy from src/lib/data/semesters.ts:
//   rename listSemestersWithGradeLevels → fetchSemestersWithGradeLevels
// Only change: `const supabase = createClient()` (no await) in each function
```

- [ ] **Step 2: Convert `src/app/(dashboard)/registration/page.tsx`** to thin shell

```tsx
import { RegistrationPanel } from "@/components/registration/registration-panel";

export default function RegistrationPage() {
  return <RegistrationPanel />;
}
```

- [ ] **Step 3: Convert `src/app/(dashboard)/registration/setup/page.tsx`** — check what this page currently does, then thin shell it similarly.

- [ ] **Step 4: Update `src/components/registration/registration-panel.tsx`** — remove all props. Add hooks:
  - `useSemesterContext()` → `ctx` for semesterId/academicYearId
  - `useSearchParams()` → grade, classroom params
  - `useAuth()` → isAdmin
  - `useQuery(["grade-levels", ctx?.semesterId])` → grades
  - `useQuery(["classrooms-by-grade", selectedGradeId])` → classrooms
  - `useQuery(["classroom-roster", selectedClassroomId])` → roster
  - `useQuery(["enrollment-candidates", ctx?.semesterId])` → candidates
  - `useQuery(["semesters-with-grade-levels", ctx?.academicYearId])` → sourceSemesters
  - `AppHeader` with `basePath="/registration"` and `clearGradeClassroomOnChange={true}`

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/registration.ts \
  src/app/(dashboard)/registration/page.tsx \
  src/app/(dashboard)/registration/setup/page.tsx \
  src/components/registration/registration-panel.tsx
git commit -m "feat: migrate registration pages to client-side"
```

---

## Task 18: Reports Pages — Browser Queries + Panel Migration

**Files:**
- Create: `src/lib/queries/reports.ts`
- Modify: `src/app/(dashboard)/reports/page.tsx`
- Modify: `src/app/(dashboard)/reports/outstanding/page.tsx`
- Modify: `src/app/(dashboard)/reports/collections/page.tsx`
- Modify: `src/components/finance/outstanding-report-panel.tsx`
- Modify: `src/components/finance/collections-report-panel.tsx`

- [ ] **Step 1: Create `src/lib/queries/reports.ts`**

Open `src/lib/data/reports.ts`. Copy types and both functions. Change only `createClient` import and remove `await`. The `teacherProfileId` filter logic stays identical.

```ts
import { createClient } from "@/lib/supabase/client";
// Copy from src/lib/data/reports.ts verbatim:
//   all exported types
//   rename listOutstandingReport → fetchOutstandingReport
//   rename listCollectionsByGrade → fetchCollectionsByGrade
// Only change: `const supabase = createClient()` (no await) in each function
```

- [ ] **Step 2: Convert `src/app/(dashboard)/reports/page.tsx`** — check what this page does; likely thin shell to a reports overview component.

- [ ] **Step 3: Convert `src/app/(dashboard)/reports/outstanding/page.tsx`** to thin shell

```tsx
import { OutstandingReportPanel } from "@/components/finance/outstanding-report-panel";

export default function OutstandingReportPage() {
  return <OutstandingReportPanel />;
}
```

- [ ] **Step 4: Convert `src/app/(dashboard)/reports/collections/page.tsx`** to thin shell

```tsx
import { CollectionsReportPanel } from "@/components/finance/collections-report-panel";

export default function CollectionsReportPage() {
  return <CollectionsReportPanel />;
}
```

- [ ] **Step 5: Update `src/components/finance/outstanding-report-panel.tsx`** — remove props, add:
  - `useRequireRole(["admin","finance","teacher"])`
  - `useSemesterContext()` → ctx
  - `useAuth()` → profile (for teacherProfileId: `profile?.role === "teacher" ? profile.id : undefined`)
  - `useSearchParams()` → grade, classroom, status params
  - `useQuery(["outstanding-report", ctx?.semesterId, ...params])` → rows
  - `useQuery(["grade-levels", ctx?.semesterId])` → grades (reuse from `src/lib/queries/classrooms.ts`)
  - `useQuery(["classrooms", ctx?.semesterId])` → classrooms
  - `AppHeader` with `basePath="/reports/outstanding"`

- [ ] **Step 6: Update `src/components/finance/collections-report-panel.tsx`** — same pattern, `basePath="/reports/collections"`

- [ ] **Step 7: Commit**

```bash
git add src/lib/queries/reports.ts \
  src/app/(dashboard)/reports/page.tsx \
  src/app/(dashboard)/reports/outstanding/page.tsx \
  src/app/(dashboard)/reports/collections/page.tsx \
  src/components/finance/outstanding-report-panel.tsx \
  src/components/finance/collections-report-panel.tsx
git commit -m "feat: migrate reports pages to client-side"
```

---

## Task 19: Cleanup

**Files:**
- Delete: `src/lib/data/page-header.ts` (if no longer used by any file)
- Verify: `src/lib/data/semester-page-context.ts` (only used by server actions now, or delete if unused)

- [ ] **Step 1: Check for remaining usages of deleted server patterns**

```bash
grep -r "getPageHeaderProps\|loadSemesterPageContext\|getCurrentProfile\|requireAdminPage\|requireFinancePage\|requireReportPage" src/app
```

Expected: no results in `src/app/(dashboard)` — only results in `src/lib/actions/` (if any)

- [ ] **Step 2: Check `src/lib/data/page-header.ts` is unused**

```bash
grep -r "page-header" src
```

If only referenced from files now deleted/changed, delete it:

```bash
git rm src/lib/data/page-header.ts
```

- [ ] **Step 3: Check `src/lib/data/semester-page-context.ts` is unused**

```bash
grep -r "semester-page-context" src
```

If no results in `src/app/` or `src/components/`, delete it:

```bash
git rm src/lib/data/semester-page-context.ts
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Fix any type errors before proceeding.

- [ ] **Step 5: Run existing tests**

```bash
npm test
```

Expected: all tests pass (pure function tests in `src/lib/**/*.test.ts` are unaffected by this migration)

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: remove server-only data helpers no longer used after client-side migration"
```

---

## Verification Checklist

After completing all tasks, verify in the browser (dev or production build):

- [ ] Navigate between pages — no `?_rsc=` network requests visible in DevTools (or only on hard refresh)
- [ ] Navigation latency < 100ms (check DevTools Performance tab)
- [ ] Auth guard works: visiting `/` while logged out redirects to `/login`
- [ ] Role guard works: finance user visiting `/academic-year` redirects to `/`
- [ ] Semester selector still changes page data correctly
- [ ] Student search and pagination work
- [ ] Server Actions (create/delete/update) still work correctly from client panels
- [ ] Logout works via UserMenu

---

## Region Configuration (Manual, Post-Deploy)

Check Vercel dashboard → Project Settings → Functions → Region. Compare with Supabase project region (Project Settings → General). Set them to the same region. For Thai school projects, `ap-southeast-1` (Singapore) is the closest available option for both platforms.

# Responsive Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mobile and tablet responsive design to the school management dashboard — slide-in drawer navigation on mobile, full sidebar on tablet/desktop, and hidden non-essential table columns on mobile.

**Architecture:** A new `SidebarContext` (in `src/hooks/use-sidebar.ts`) holds drawer open/close state and auto-closes on route change. `AppSidebar` renders a fixed `<aside>` on desktop and a `<Sheet>` drawer on mobile — both sharing one `SidebarContent` component so nav items are never duplicated. `AppHeader` reads the context to open the drawer via a hamburger button visible only on mobile. Tables hide secondary columns with `hidden md:table-cell` Tailwind classes.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS, Base UI Sheet (`src/components/ui/sheet.tsx`), lucide-react (`Menu` icon)

**Note on testing:** The vitest config uses `environment: "node"` with no jsdom. React hook tests are not viable without adding jsdom. Verification for all tasks is done via manual browser testing (resize to mobile width in DevTools).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/hooks/use-sidebar.ts` | **Create** | Sidebar context, provider, hook |
| `src/components/app-sidebar.tsx` | **Modify** | Extract SidebarContent, add mobile Sheet, consume context |
| `src/components/app-header.tsx` | **Modify** | Add hamburger button, consume context |
| `src/app/(dashboard)/layout.tsx` | **Modify** | Wrap with SidebarProvider, fix margin class |
| `src/components/students/students-panel.tsx` | **Modify** | Hide รหัส + เลขบัตร columns on mobile |
| `src/components/finance/invoices-panel.tsx` | **Modify** | Hide รหัส + ชั้น/ห้อง + ใบแจ้ง columns on mobile |
| `src/components/finance/payments-panel.tsx` | **Modify** | Hide เลขที่ + รหัส + ชั้น/ห้อง + วิธี columns on mobile |

---

## Task 1: Create `useSidebar` hook and context

**Files:**
- Create: `src/hooks/use-sidebar.ts`

- [ ] **Step 1: Create the hook file**

Create `src/hooks/use-sidebar.ts` with this exact content:

```ts
"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { usePathname } from "next/navigation"

type SidebarContextValue = {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        toggle: () => setIsOpen((v) => !v),
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebarContext() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error("useSidebarContext must be used within SidebarProvider")
  return ctx
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `use-sidebar.ts`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-sidebar.ts
git commit -m "feat: add useSidebar context and hook"
```

---

## Task 2: Refactor `AppSidebar` for responsive layout

**Files:**
- Modify: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Replace the entire file content**

Open `src/components/app-sidebar.tsx` and replace the entire content with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  ChartColumn,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Receipt,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useSidebarContext } from "@/hooks/use-sidebar";

const basicNav = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/academic-year", label: "ปีการศึกษา", icon: Calendar },
  { href: "/students", label: "นักเรียน", icon: Users },
  { href: "/registration", label: "ลงทะเบียน", icon: ClipboardList },
];

const financeNav = [
  { href: "/fee-rates", label: "ตั้งค่าค่าธรรมเนียม", icon: SlidersHorizontal },
  { href: "/receipt-types", label: "ประเภทใบเสร็จ", icon: Receipt },
  { href: "/invoices", label: "ใบแจ้งชำระ", icon: FileText },
  { href: "/payments", label: "บันทึกการจ่าย", icon: CreditCard },
  { href: "/reports/outstanding", label: "รายงานค้างชำระ", icon: ChartColumn },
  { href: "/reports/collections", label: "สรุปการเก็บ", icon: ChartColumn },
];

function NavSection({
  title,
  items,
}: {
  title: string;
  items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}) {
  const pathname = usePathname();

  return (
    <div className="mb-6">
      <h3 className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-1">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SidebarContent() {
  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <GraduationCap className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">โรงเรียนตัวอย่าง</span>
          <span className="text-xs text-muted-foreground">ประถมศึกษา</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavSection title="ข้อมูลพื้นฐาน" items={basicNav} />
        <NavSection title="การเงิน" items={financeNav} />
      </nav>
    </>
  );
}

export function AppSidebar() {
  const { isOpen, close } = useSidebarContext();

  return (
    <>
      {/* Desktop: fixed sidebar, hidden on mobile */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[260px] flex-col border-r border-border bg-sidebar md:flex">
        <SidebarContent />
      </aside>

      {/* Mobile: Sheet drawer */}
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
        <SheetContent side="left" className="w-[260px] p-0" showCloseButton={false}>
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "feat: refactor AppSidebar for mobile Sheet drawer"
```

---

## Task 3: Update `DashboardLayout` — wrap with provider and fix margin

**Files:**
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Replace the file content**

Open `src/app/(dashboard)/layout.tsx` and replace the entire content with:

```tsx
"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/hooks/use-sidebar";

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
    <SidebarProvider>
      <div className="min-h-screen bg-background">
        <AppSidebar />
        <div className="md:ml-[260px]">{children}</div>
      </div>
    </SidebarProvider>
  );
}
```

The only changes from the original are:
1. Added `SidebarProvider` import and wrapper
2. Changed `ml-[260px]` → `md:ml-[260px]`

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Manual test — start dev server and resize**

```bash
yarn dev
```

Open `http://localhost:3000` in browser. Open DevTools → toggle device toolbar → set width to 375px (mobile). Expected: no left margin, content fills full width. Set width to 900px (tablet). Expected: 260px sidebar visible, content has left margin.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/layout.tsx
git commit -m "feat: wrap dashboard layout with SidebarProvider and fix mobile margin"
```

---

## Task 4: Update `AppHeader` — add hamburger button

**Files:**
- Modify: `src/components/app-header.tsx`

- [ ] **Step 1: Replace the file content**

Open `src/components/app-header.tsx` and replace the entire content with:

```tsx
"use client";

import { Menu } from "lucide-react";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { UserMenu } from "@/components/auth/user-menu";
import { YearSemesterSelect } from "@/components/context/year-semester-select";
import { useSidebarContext } from "@/hooks/use-sidebar";

type AppHeaderProps = {
  title: string;
  basePath?: string;
  clearGradeClassroomOnChange?: boolean;
};

export function AppHeader({ title, basePath, clearGradeClassroomOnChange = false }: AppHeaderProps) {
  const { years, semesters, ctx } = useSemesterContext();
  const { open } = useSidebarContext();

  const showSelectors = Boolean(basePath && ctx);
  const subtitleYear = ctx?.academicYearName;
  const subtitleSemester = ctx?.semesterNumber ?? 1;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center">
        <button
          className="-ml-1 mr-3 flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-accent md:hidden"
          onClick={open}
          aria-label="เปิดเมนู"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitleYear ? (
            <p className="text-xs text-muted-foreground">
              ภาคเรียนที่ {subtitleSemester} · ปี {subtitleYear}
            </p>
          ) : null}
        </div>
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Manual test — hamburger and drawer**

With dev server running at `http://localhost:3000`, set DevTools width to 375px.

Expected:
- Hamburger `☰` icon visible in header top-left
- Clicking hamburger → sidebar slides in from left with dark overlay
- Clicking overlay → sidebar closes
- Clicking a nav link → sidebar closes and navigates
- At 900px width → hamburger is hidden, sidebar always visible

- [ ] **Step 4: Commit**

```bash
git add src/components/app-header.tsx
git commit -m "feat: add hamburger button to AppHeader for mobile drawer"
```

---

## Task 5: Hide columns in students table on mobile

**Files:**
- Modify: `src/components/students/students-panel.tsx:290-292,330-332`

Hide columns: **รหัส** and **เลขบัตร**

- [ ] **Step 1: Hide the รหัส header (line ~290)**

Find:
```tsx
<TableHead>รหัส</TableHead>
<TableHead>ชื่อ-นามสกุล</TableHead>
<TableHead>เลขบัตร</TableHead>
```

Replace with:
```tsx
<TableHead className="hidden md:table-cell">รหัส</TableHead>
<TableHead>ชื่อ-นามสกุล</TableHead>
<TableHead className="hidden md:table-cell">เลขบัตร</TableHead>
```

- [ ] **Step 2: Hide the รหัส and เลขบัตร data cells (line ~330-332)**

Find:
```tsx
<TableCell className="font-medium tabular-nums">{student.studentCode}</TableCell>
<TableCell>{student.name}</TableCell>
<TableCell>{student.idCard ?? "—"}</TableCell>
```

Replace with:
```tsx
<TableCell className="hidden font-medium tabular-nums md:table-cell">{student.studentCode}</TableCell>
<TableCell>{student.name}</TableCell>
<TableCell className="hidden md:table-cell">{student.idCard ?? "—"}</TableCell>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Manual test**

Navigate to `/students` in DevTools at 375px. Expected: table shows ชื่อ-นามสกุล, ชั้น, สถานะ columns only. At 900px: all columns visible.

- [ ] **Step 5: Commit**

```bash
git add src/components/students/students-panel.tsx
git commit -m "feat: hide secondary columns in students table on mobile"
```

---

## Task 6: Hide columns in invoices table on mobile

**Files:**
- Modify: `src/components/finance/invoices-panel.tsx:369-372,404-407`

Hide columns: **รหัส**, **ชั้น/ห้อง**, **ใบแจ้ง**

- [ ] **Step 1: Hide the three header cells (line ~369-372)**

Find:
```tsx
<TableHead>รหัส</TableHead>
<TableHead>ชื่อ-นามสกุล</TableHead>
<TableHead>ชั้น/ห้อง</TableHead>
<TableHead>ใบแจ้ง</TableHead>
```

Replace with:
```tsx
<TableHead className="hidden md:table-cell">รหัส</TableHead>
<TableHead>ชื่อ-นามสกุล</TableHead>
<TableHead className="hidden md:table-cell">ชั้น/ห้อง</TableHead>
<TableHead className="hidden md:table-cell">ใบแจ้ง</TableHead>
```

- [ ] **Step 2: Hide the three data cells (line ~404-407)**

Find:
```tsx
<TableCell className="tabular-nums">{row.studentCode}</TableCell>
<TableCell>{row.studentName}</TableCell>
<TableCell>{row.gradeClassroom}</TableCell>
<TableCell className="max-w-[180px] truncate">{row.invoiceName}</TableCell>
```

Replace with:
```tsx
<TableCell className="hidden tabular-nums md:table-cell">{row.studentCode}</TableCell>
<TableCell>{row.studentName}</TableCell>
<TableCell className="hidden md:table-cell">{row.gradeClassroom}</TableCell>
<TableCell className="hidden max-w-[180px] truncate md:table-cell">{row.invoiceName}</TableCell>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Manual test**

Navigate to `/invoices` at 375px. Expected: ชื่อ-นามสกุล, ต้องชำระ, ค้าง, สถานะ visible; รหัส/ชั้น/ห้อง/ใบแจ้ง hidden. At 900px: all columns visible.

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/invoices-panel.tsx
git commit -m "feat: hide secondary columns in invoices table on mobile"
```

---

## Task 7: Hide columns in payments table on mobile

**Files:**
- Modify: `src/components/finance/payments-panel.tsx:536-541,557-564`

Hide columns: **เลขที่**, **รหัส**, **ชั้น/ห้อง**, **วิธี**

- [ ] **Step 1: Hide the four header cells (line ~536-541)**

Find:
```tsx
<TableHead>เลขที่</TableHead>
<TableHead>รหัส</TableHead>
<TableHead>นักเรียน</TableHead>
<TableHead>ชั้น/ห้อง</TableHead>
<TableHead>วันที่</TableHead>
<TableHead>วิธี</TableHead>
```

Replace with:
```tsx
<TableHead className="hidden md:table-cell">เลขที่</TableHead>
<TableHead className="hidden md:table-cell">รหัส</TableHead>
<TableHead>นักเรียน</TableHead>
<TableHead className="hidden md:table-cell">ชั้น/ห้อง</TableHead>
<TableHead>วันที่</TableHead>
<TableHead className="hidden md:table-cell">วิธี</TableHead>
```

- [ ] **Step 2: Hide the four data cells (line ~557-564)**

Find:
```tsx
<TableCell className="tabular-nums">{p.receiptNumber}</TableCell>
<TableCell className="tabular-nums">{p.studentCode}</TableCell>
<TableCell>{p.studentName}</TableCell>
<TableCell className="text-muted-foreground">{p.gradeClassroom}</TableCell>
<TableCell className="whitespace-nowrap text-muted-foreground">
  {p.paidAtLabel}
</TableCell>
<TableCell>{PAYMENT_METHOD_LABELS[p.paymentMethod]}</TableCell>
```

Replace with:
```tsx
<TableCell className="hidden tabular-nums md:table-cell">{p.receiptNumber}</TableCell>
<TableCell className="hidden tabular-nums md:table-cell">{p.studentCode}</TableCell>
<TableCell>{p.studentName}</TableCell>
<TableCell className="hidden text-muted-foreground md:table-cell">{p.gradeClassroom}</TableCell>
<TableCell className="whitespace-nowrap text-muted-foreground">
  {p.paidAtLabel}
</TableCell>
<TableCell className="hidden md:table-cell">{PAYMENT_METHOD_LABELS[p.paymentMethod]}</TableCell>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Manual test**

Navigate to `/payments` at 375px. Expected: นักเรียน, วันที่, จำนวน, สถานะ, จัดการ visible; เลขที่/รหัส/ชั้น/ห้อง/วิธี hidden. At 900px: all columns visible.

- [ ] **Step 5: Final full regression test**

With DevTools at 375px, navigate through all dashboard pages:
- `/` (ภาพรวม) — no sidebar visible, hamburger in header
- `/students` — table shows 3 main columns
- `/invoices` — table shows 4 main columns
- `/payments` — table shows 5 main columns
- `/academic-year`, `/registration`, `/fee-rates`, `/receipt-types` — layout OK

With DevTools at 900px:
- All pages show full 260px sidebar, no hamburger

- [ ] **Step 6: Commit**

```bash
git add src/components/finance/payments-panel.tsx
git commit -m "feat: hide secondary columns in payments table on mobile"
```

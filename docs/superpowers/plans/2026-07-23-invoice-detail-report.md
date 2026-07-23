# Invoice Detail Additions to Outstanding Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/reports/outstanding` so it can show a "paid" status, filter by invoice type, and display issued/last-paid dates per invoice row — per `docs/superpowers/specs/2026-07-23-invoice-detail-report-design.md`.

**Architecture:** Add a pure, unit-testable helper that reduces raw `payment_allocations`/`payments` rows into a `Map<invoiceId, lastPaidAt>`. Wire it into `fetchOutstandingReport` in `src/lib/queries/reports.ts` alongside a new `invoiceTypeId` filter and two new row fields (`invoiceTypeName`, `issuedAt`). Update `OutstandingReportPanel` to expose the new filters and columns, reusing the existing `fetchInvoiceTypes()` helper and URL-param pattern already used for `grade`/`classroom`/`status`/`variant`/`view`.

**Tech Stack:** Next.js (App Router), Supabase JS client, TanStack Query, Vitest, Tailwind.

---

## File Structure

- Create: `src/lib/reports/last-paid.ts` — pure function computing latest active payment date per invoice from allocation rows
- Create: `src/lib/reports/last-paid.test.ts` — Vitest unit tests for that function
- Modify: `src/lib/queries/reports.ts` — extend `fetchOutstandingReport` (invoice type filter, new row fields, paid status, last-paid query)
- Modify: `src/components/finance/outstanding-report-panel.tsx` — new status option, new invoice-type filter, new date columns (list view, byRoom view, mobile cards)

---

### Task 1: Pure helper for "last paid date per invoice"

**Files:**
- Create: `src/lib/reports/last-paid.ts`
- Test: `src/lib/reports/last-paid.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/reports/last-paid.test.ts
import { describe, it, expect } from "vitest";
import { latestPaidAtByInvoice } from "./last-paid";

describe("latestPaidAtByInvoice", () => {
  it("returns the max paid_at per invoice_id", () => {
    const rows = [
      { invoiceId: "inv-1", paidAt: "2026-05-01T03:00:00.000Z", status: "active" as const },
      { invoiceId: "inv-1", paidAt: "2026-06-01T03:00:00.000Z", status: "active" as const },
      { invoiceId: "inv-2", paidAt: "2026-04-15T03:00:00.000Z", status: "active" as const },
    ];

    const result = latestPaidAtByInvoice(rows);

    expect(result.get("inv-1")).toBe("2026-06-01T03:00:00.000Z");
    expect(result.get("inv-2")).toBe("2026-04-15T03:00:00.000Z");
  });

  it("ignores voided payments", () => {
    const rows = [
      { invoiceId: "inv-1", paidAt: "2026-06-01T03:00:00.000Z", status: "voided" as const },
    ];

    const result = latestPaidAtByInvoice(rows);

    expect(result.has("inv-1")).toBe(false);
  });

  it("returns an empty map for no rows", () => {
    expect(latestPaidAtByInvoice([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest run src/lib/reports/last-paid.test.ts`
Expected: FAIL with `Cannot find module './last-paid'` (or similar module-not-found error)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/reports/last-paid.ts
export type PaymentAllocationRow = {
  invoiceId: string;
  paidAt: string;
  status: "active" | "voided";
};

export function latestPaidAtByInvoice(rows: PaymentAllocationRow[]): Map<string, string> {
  const result = new Map<string, string>();

  for (const row of rows) {
    if (row.status !== "active") continue;
    const current = result.get(row.invoiceId);
    if (!current || row.paidAt > current) {
      result.set(row.invoiceId, row.paidAt);
    }
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest run src/lib/reports/last-paid.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/last-paid.ts src/lib/reports/last-paid.test.ts
git commit -m "feat(reports): add pure helper for latest paid date per invoice"
```

---

### Task 2: Extend `fetchOutstandingReport` with invoice type filter and new row fields

**Files:**
- Modify: `src/lib/queries/reports.ts:6-181` (type `OutstandingReportRow` and function `fetchOutstandingReport`)

- [ ] **Step 1: Update the `OutstandingReportRow` type (reports.ts:6-17)**

Replace:
```typescript
export type OutstandingReportRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: "unpaid" | "partial" | "paid";
  isReimbursable: boolean;
};
```

With:
```typescript
export type OutstandingReportRow = {
  invoiceId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: "unpaid" | "partial" | "paid";
  isReimbursable: boolean;
  invoiceTypeName: string;
  issuedAt: string;
  lastPaidAt: string | null;
};
```

- [ ] **Step 2: Add the import for the new helper**

At the top of `src/lib/queries/reports.ts`, after the existing imports (reports.ts:1-4), add:

```typescript
import { latestPaidAtByInvoice } from "@/lib/reports/last-paid";
```

- [ ] **Step 3: Add `invoiceTypeId` to the params type (reports.ts:61-70)**

Replace:
```typescript
export async function fetchOutstandingReport(params: {
  semesterId: string;
  academicYearId: string;
  gradeLevelId?: string;
  classroomId?: string;
  status?: "unpaid" | "partial" | "paid" | "all";
  variant?: "standard" | "reimbursable" | "all";
  teacherProfileId?: string;
  includeAllStatuses?: boolean;
}): Promise<OutstandingReportRow[]> {
```

With:
```typescript
export async function fetchOutstandingReport(params: {
  semesterId: string;
  academicYearId: string;
  gradeLevelId?: string;
  classroomId?: string;
  status?: "unpaid" | "partial" | "paid" | "all";
  variant?: "standard" | "reimbursable" | "all";
  invoiceTypeId?: string;
  teacherProfileId?: string;
  includeAllStatuses?: boolean;
}): Promise<OutstandingReportRow[]> {
```

- [ ] **Step 4: Add the invoice type filter next to the variant filter (reports.ts:142-146)**

Find:
```typescript
  if (params.variant === "reimbursable") {
    query = query.eq("is_reimbursable", true);
  } else if (params.variant === "standard") {
    query = query.eq("is_reimbursable", false);
  }
```

Add immediately after it:
```typescript

  if (params.invoiceTypeId) {
    query = query.eq("invoice_type_id", params.invoiceTypeId);
  }
```

- [ ] **Step 5: Extend the select to pull id, created_at, and invoice type name (reports.ts:119-134)**

Replace:
```typescript
  let query = supabase
    .from("student_invoices")
    .select(
      `
      student_id,
      subtotal,
      total_amount,
      paid_amount,
      status,
      is_reimbursable,
      students!inner ( student_code, first_name, last_name )
    `,
    )
    .eq("academic_year_id", params.academicYearId)
    .eq("semester_id", params.semesterId)
    .order("student_code", { ascending: true, foreignTable: "students" });
```

With:
```typescript
  let query = supabase
    .from("student_invoices")
    .select(
      `
      id,
      student_id,
      subtotal,
      total_amount,
      paid_amount,
      status,
      is_reimbursable,
      created_at,
      invoice_types ( name ),
      students!inner ( student_code, first_name, last_name )
    `,
    )
    .eq("academic_year_id", params.academicYearId)
    .eq("semester_id", params.semesterId)
    .order("student_code", { ascending: true, foreignTable: "students" });
```

- [ ] **Step 6: Update the `Row` type and mapping to include the new fields, and query last-paid dates (reports.ts:152-181)**

Replace:
```typescript
  const { data } = await query;

  type Row = {
    student_id: string;
    subtotal: number;
    total_amount: number;
    paid_amount: number;
    status: "unpaid" | "partial" | "paid";
    is_reimbursable: boolean;
    students: { student_code: string; first_name: string; last_name: string };
  };

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const totalAmount = Number(row.total_amount);
    const paidAmount = Number(row.paid_amount);
    const subtotal = Number(row.subtotal);
    return {
      studentId: row.student_id,
      studentCode: row.students.student_code,
      studentName: formatStudentName(row.students.first_name, row.students.last_name),
      gradeClassroom: gradeByStudent.get(row.student_id) ?? "—",
      subtotal,
      totalAmount,
      paidAmount,
      outstanding: Math.max(0, round2(totalAmount - paidAmount)),
      isReimbursable: row.is_reimbursable,
      status: row.status,
    };
  });
}
```

With:
```typescript
  const { data } = await query;

  type Row = {
    id: string;
    student_id: string;
    subtotal: number;
    total_amount: number;
    paid_amount: number;
    status: "unpaid" | "partial" | "paid";
    is_reimbursable: boolean;
    created_at: string;
    invoice_types: { name: string } | null;
    students: { student_code: string; first_name: string; last_name: string };
  };

  const rows = (data ?? []) as unknown as Row[];
  const invoiceIds = rows.map((row) => row.id);
  const lastPaidByInvoice = await fetchLastPaidAtByInvoiceIds(supabase, invoiceIds);

  return rows.map((row) => {
    const totalAmount = Number(row.total_amount);
    const paidAmount = Number(row.paid_amount);
    const subtotal = Number(row.subtotal);
    return {
      invoiceId: row.id,
      studentId: row.student_id,
      studentCode: row.students.student_code,
      studentName: formatStudentName(row.students.first_name, row.students.last_name),
      gradeClassroom: gradeByStudent.get(row.student_id) ?? "—",
      subtotal,
      totalAmount,
      paidAmount,
      outstanding: Math.max(0, round2(totalAmount - paidAmount)),
      isReimbursable: row.is_reimbursable,
      status: row.status,
      invoiceTypeName: row.invoice_types?.name ?? "—",
      issuedAt: row.created_at,
      lastPaidAt: lastPaidByInvoice.get(row.id) ?? null,
    };
  });
}

async function fetchLastPaidAtByInvoiceIds(
  supabase: ReturnType<typeof createClient>,
  invoiceIds: string[],
): Promise<Map<string, string>> {
  if (invoiceIds.length === 0) return new Map();

  const { data } = await supabase
    .from("payment_allocations")
    .select("invoice_id, payments!inner ( paid_at, status )")
    .in("invoice_id", invoiceIds);

  type AllocationRow = {
    invoice_id: string;
    payments: { paid_at: string; status: "active" | "voided" };
  };

  const allocationRows = (data ?? []) as unknown as AllocationRow[];

  return latestPaidAtByInvoice(
    allocationRows.map((row) => ({
      invoiceId: row.invoice_id,
      paidAt: row.payments.paid_at,
      status: row.payments.status,
    })),
  );
}
```

- [ ] **Step 7: Run the full test suite to confirm nothing else broke**

Run: `yarn vitest run`
Expected: PASS (all existing tests, plus the 3 new tests from Task 1)

- [ ] **Step 8: Commit**

```bash
git add src/lib/queries/reports.ts
git commit -m "feat(reports): add invoice type filter and issued/last-paid dates to outstanding report"
```

---

### Task 3: Add "paid" status option and wire `includeAllStatuses`

**Files:**
- Modify: `src/components/finance/outstanding-report-panel.tsx:33-37, 59-98`

- [ ] **Step 1: Widen the accepted status param and add "paid" to `STATUS_ITEMS` (outstanding-report-panel.tsx:33-37, 61-63)**

Replace:
```typescript
const STATUS_ITEMS = [
  { value: "all", label: "ค้างทั้งหมด" },
  { value: "unpaid", label: "ค้างชำระ" },
  { value: "partial", label: "ชำระบางส่วน" },
];
```

With:
```typescript
const STATUS_ITEMS = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "unpaid", label: "ค้างชำระ" },
  { value: "partial", label: "ชำระบางส่วน" },
  { value: "paid", label: "ชำระแล้ว" },
];
```

Replace:
```typescript
  const rawStatus = searchParams.get("status");
  const statusParam =
    rawStatus === "unpaid" || rawStatus === "partial" ? rawStatus : ("all" as const);
```

With:
```typescript
  const rawStatus = searchParams.get("status");
  const statusParam =
    rawStatus === "unpaid" || rawStatus === "partial" || rawStatus === "paid"
      ? rawStatus
      : ("all" as const);
```

- [ ] **Step 2: Send `includeAllStatuses: true` so "all" no longer silently excludes paid invoices (outstanding-report-panel.tsx:87-96)**

Find:
```typescript
    queryFn: () =>
      fetchOutstandingReport({
        semesterId: ctx!.semesterId,
        academicYearId: ctx!.academicYearId,
        gradeLevelId: gradeParam !== "all" ? gradeParam : undefined,
        classroomId: classroomParam !== "all" ? classroomParam : undefined,
        status: statusParam,
        variant: variantValue,
        teacherProfileId,
      }),
```

Replace with:
```typescript
    queryFn: () =>
      fetchOutstandingReport({
        semesterId: ctx!.semesterId,
        academicYearId: ctx!.academicYearId,
        gradeLevelId: gradeParam !== "all" ? gradeParam : undefined,
        classroomId: classroomParam !== "all" ? classroomParam : undefined,
        status: statusParam,
        variant: variantValue,
        invoiceTypeId: invoiceTypeParam !== "all" ? invoiceTypeParam : undefined,
        teacherProfileId,
        includeAllStatuses: true,
      }),
```

(`invoiceTypeParam` is introduced in Task 4 — this step alone will not compile standalone; Task 4 must land in the same commit or immediately after. Do Task 4 before running the build/test step below.)

- [ ] **Step 3: Defer verification to end of Task 4**

No standalone test here — `invoiceTypeParam` doesn't exist yet. Proceed directly to Task 4, then verify both together.

---

### Task 4: Add invoice type filter and new date columns

**Files:**
- Modify: `src/components/finance/outstanding-report-panel.tsx` (imports, state, filter UI, table columns, mobile cards)

- [ ] **Step 1: Add imports (outstanding-report-panel.tsx:1-31)**

Find:
```typescript
import { fetchOutstandingReport } from "@/lib/queries/reports";
import { fetchGradeLevels, fetchClassroomsBySemester } from "@/lib/queries/classrooms";
```

Replace with:
```typescript
import { fetchOutstandingReport } from "@/lib/queries/reports";
import { fetchGradeLevels, fetchClassroomsBySemester } from "@/lib/queries/classrooms";
import { fetchInvoiceTypes } from "@/lib/queries/invoice-types";
```

Find:
```typescript
import { formatBaht } from "@/lib/format";
```

Replace with:
```typescript
import { formatBaht, formatThaiDate } from "@/lib/format";
```

- [ ] **Step 2: Read the `invoiceType` URL param (outstanding-report-panel.tsx, right after the `variantValue` block, before `viewParam`)**

Find:
```typescript
  const variantParam = searchParams.get("variant") ?? "all";
  const variantValue: "all" | "standard" | "reimbursable" =
    variantParam === "reimbursable" || variantParam === "standard"
      ? variantParam
      : "all";

  const viewParam: "list" | "byRoom" =
```

Replace with:
```typescript
  const variantParam = searchParams.get("variant") ?? "all";
  const variantValue: "all" | "standard" | "reimbursable" =
    variantParam === "reimbursable" || variantParam === "standard"
      ? variantParam
      : "all";

  const invoiceTypeParam = searchParams.get("invoiceType") ?? "all";

  const viewParam: "list" | "byRoom" =
```

- [ ] **Step 3: Fetch invoice types (outstanding-report-panel.tsx, after the `classrooms` query)**

Find:
```typescript
  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms", ctx?.semesterId],
    queryFn: () => fetchClassroomsBySemester(ctx!.semesterId),
    enabled: !!ctx,
  });
```

Replace with:
```typescript
  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms", ctx?.semesterId],
    queryFn: () => fetchClassroomsBySemester(ctx!.semesterId),
    enabled: !!ctx,
  });

  const { data: invoiceTypes = [] } = useQuery({
    queryKey: ["invoice-types"],
    queryFn: fetchInvoiceTypes,
  });
```

- [ ] **Step 4: Add `invoiceType` to the `params`/`pushParams` object**

Find:
```typescript
  const params = { grade: gradeParam, classroom: classroomParam, status: statusParam, variant: variantValue, view: viewParam };

  const pushParams = useCallback(
    (next: Partial<typeof params>) => {
      const query = new URLSearchParams(window.location.search);
      const grade = next.grade ?? params.grade;
      const classroom = next.classroom ?? params.classroom;
      const status = next.status ?? params.status;
      const variant = next.variant ?? params.variant;
      const view = next.view ?? params.view;

      if (grade !== "all") query.set("grade", grade);
      else query.delete("grade");
      if (classroom !== "all") query.set("classroom", classroom);
      else query.delete("classroom");
      if (status !== "all") query.set("status", status);
      else query.delete("status");
      if (variant !== "all") query.set("variant", variant);
      else query.delete("variant");
      if (view !== "list") query.set("view", view);
      else query.delete("view");

      router.push(`${pathname}?${query.toString()}`);
    },
    [params, pathname, router],
  );
```

Replace with:
```typescript
  const params = {
    grade: gradeParam,
    classroom: classroomParam,
    status: statusParam,
    variant: variantValue,
    invoiceType: invoiceTypeParam,
    view: viewParam,
  };

  const pushParams = useCallback(
    (next: Partial<typeof params>) => {
      const query = new URLSearchParams(window.location.search);
      const grade = next.grade ?? params.grade;
      const classroom = next.classroom ?? params.classroom;
      const status = next.status ?? params.status;
      const variant = next.variant ?? params.variant;
      const invoiceType = next.invoiceType ?? params.invoiceType;
      const view = next.view ?? params.view;

      if (grade !== "all") query.set("grade", grade);
      else query.delete("grade");
      if (classroom !== "all") query.set("classroom", classroom);
      else query.delete("classroom");
      if (status !== "all") query.set("status", status);
      else query.delete("status");
      if (variant !== "all") query.set("variant", variant);
      else query.delete("variant");
      if (invoiceType !== "all") query.set("invoiceType", invoiceType);
      else query.delete("invoiceType");
      if (view !== "list") query.set("view", view);
      else query.delete("view");

      router.push(`${pathname}?${query.toString()}`);
    },
    [params, pathname, router],
  );
```

- [ ] **Step 5: Build the invoice type select items (next to `classroomItems`)**

Find:
```typescript
  const classroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => params.grade === "all" || c.grade_level_id === params.grade)
      .map((c) => ({ value: c.id, label: `${grades.find((g) => g.id === c.grade_level_id)?.name ?? ""}/${c.name}` })),
  ];
```

Replace with:
```typescript
  const classroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => params.grade === "all" || c.grade_level_id === params.grade)
      .map((c) => ({ value: c.id, label: `${grades.find((g) => g.id === c.grade_level_id)?.name ?? ""}/${c.name}` })),
  ];

  const invoiceTypeItems = [
    { value: "all", label: "ทุกประเภทใบแจ้งหนี้" },
    ...invoiceTypes.map((t) => ({ value: t.id, label: t.name })),
  ];
```

- [ ] **Step 6: Add the Select control in the toolbar, after the "ประเภท" (reimbursable variant) select**

Find:
```typescript
            <Select
              value={params.variant}
              onValueChange={(v) => pushParams({ variant: (v ?? "all") as typeof params.variant })}
              items={REIMBURSABLE_ITEMS}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="ประเภท" />
              </SelectTrigger>
              <SelectContent>
                {REIMBURSABLE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={viewParam}
```

Replace with:
```typescript
            <Select
              value={params.variant}
              onValueChange={(v) => pushParams({ variant: (v ?? "all") as typeof params.variant })}
              items={REIMBURSABLE_ITEMS}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="ประเภท" />
              </SelectTrigger>
              <SelectContent>
                {REIMBURSABLE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={params.invoiceType}
              onValueChange={(v) => pushParams({ invoiceType: v ?? "all" })}
              items={invoiceTypeItems}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="ประเภทใบแจ้งหนี้" />
              </SelectTrigger>
              <SelectContent>
                {invoiceTypeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={viewParam}
```

- [ ] **Step 7: Add date columns to the mobile cards, and switch the card key to `invoiceId`**

A student can now appear in multiple rows (once per invoice), so the existing `key={row.studentId}` on the card wrapper is no longer unique. Update it in the same edit.

Find:
```typescript
              {rows.map((row) => (
                <div key={row.studentId} className="rounded-lg border border-border px-4 py-3">
```

Replace with:
```typescript
              {rows.map((row) => (
                <div key={row.invoiceId} className="rounded-lg border border-border px-4 py-3">
```

Find:
```typescript
                  <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                    <span>ต้องชำระ <span className="tabular-nums text-foreground">{formatBaht(row.totalAmount)}</span></span>
                    <span>ชำระแล้ว <span className="tabular-nums text-foreground">{formatBaht(row.paidAmount)}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
```

Replace with:
```typescript
                  <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                    <span>ต้องชำระ <span className="tabular-nums text-foreground">{formatBaht(row.totalAmount)}</span></span>
                    <span>ชำระแล้ว <span className="tabular-nums text-foreground">{formatBaht(row.paidAmount)}</span></span>
                  </div>
                  <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                    <span>ออกใบ {formatThaiDate(row.issuedAt)}</span>
                    <span>จ่ายล่าสุด {row.lastPaidAt ? formatThaiDate(row.lastPaidAt) : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
```

- [ ] **Step 8: Add date columns to the "byRoom" desktop table (header + row)**

Find:
```typescript
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>รหัส</TableHead>
                            <TableHead>ชื่อ-นามสกุล</TableHead>
                            <TableHead className="text-right">ต้องชำระ</TableHead>
                            <TableHead className="text-right">ชำระแล้ว</TableHead>
                            <TableHead className="text-right">ค้าง</TableHead>
                            <TableHead>สถานะ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {roomRows.map((row) => (
                            <TableRow key={row.studentId}>
                              <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                              <TableCell>{row.studentName}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatBaht(row.totalAmount)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatBaht(row.paidAmount)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{formatBaht(row.outstanding)}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{INVOICE_STATUS_LABELS[row.status]}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
```

Replace with:
```typescript
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>รหัส</TableHead>
                            <TableHead>ชื่อ-นามสกุล</TableHead>
                            <TableHead className="text-right">ต้องชำระ</TableHead>
                            <TableHead className="text-right">ชำระแล้ว</TableHead>
                            <TableHead className="text-right">ค้าง</TableHead>
                            <TableHead>สถานะ</TableHead>
                            <TableHead>วันที่ออกใบ</TableHead>
                            <TableHead>จ่ายล่าสุด</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {roomRows.map((row) => (
                            <TableRow key={row.invoiceId}>
                              <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                              <TableCell>{row.studentName}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatBaht(row.totalAmount)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatBaht(row.paidAmount)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{formatBaht(row.outstanding)}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{INVOICE_STATUS_LABELS[row.status]}</Badge>
                              </TableCell>
                              <TableCell>{formatThaiDate(row.issuedAt)}</TableCell>
                              <TableCell>{row.lastPaidAt ? formatThaiDate(row.lastPaidAt) : "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
```

- [ ] **Step 9: Add date columns to the "list" desktop table (header + row)**

Find:
```typescript
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อ-นามสกุล</TableHead>
                  <TableHead>ชั้น/ห้อง</TableHead>
                  <TableHead className="text-right">ค่าใช้จ่าย</TableHead>
                  <TableHead className="text-right">ต้องชำระ</TableHead>
                  <TableHead className="text-right">ชำระแล้ว</TableHead>
                  <TableHead className="text-right">ค้าง</TableHead>
                  <TableHead>สถานะ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                      กำลังโหลด...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                      ไม่พบรายการค้างชำระ
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{row.studentName}</span>
                          {row.isReimbursable ? (
                            <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">เบิกได้</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{row.gradeClassroom}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(row.subtotal)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBaht(row.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBaht(row.paidAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatBaht(row.outstanding)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{INVOICE_STATUS_LABELS[row.status]}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
```

Replace with:
```typescript
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อ-นามสกุล</TableHead>
                  <TableHead>ชั้น/ห้อง</TableHead>
                  <TableHead className="text-right">ค่าใช้จ่าย</TableHead>
                  <TableHead className="text-right">ต้องชำระ</TableHead>
                  <TableHead className="text-right">ชำระแล้ว</TableHead>
                  <TableHead className="text-right">ค้าง</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>วันที่ออกใบ</TableHead>
                  <TableHead>จ่ายล่าสุด</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-6 text-center text-muted-foreground">
                      กำลังโหลด...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-6 text-center text-muted-foreground">
                      ไม่พบรายการค้างชำระ
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.invoiceId}>
                      <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{row.studentName}</span>
                          {row.isReimbursable ? (
                            <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">เบิกได้</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{row.gradeClassroom}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(row.subtotal)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBaht(row.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBaht(row.paidAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatBaht(row.outstanding)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{INVOICE_STATUS_LABELS[row.status]}</Badge>
                      </TableCell>
                      <TableCell>{formatThaiDate(row.issuedAt)}</TableCell>
                      <TableCell>{row.lastPaidAt ? formatThaiDate(row.lastPaidAt) : "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
```

- [ ] **Step 10: Update the `groupedByRoom` key typing note — no code change needed**

`groupedByRoom` already groups by `row.gradeClassroom`, which is unaffected by this change. Skip.

- [ ] **Step 11: Type-check and run the test suite**

Run: `yarn tsc --noEmit`
Expected: No errors

Run: `yarn vitest run`
Expected: PASS (all tests, including Task 1's 3 new tests)

- [ ] **Step 12: Commit**

```bash
git add src/components/finance/outstanding-report-panel.tsx
git commit -m "feat(reports): add paid status, invoice type filter, and date columns to outstanding report"
```

---

### Task 5: Manual verification in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server preview** (use the project's dev server, e.g. `yarn dev`, opened via the browser preview tool)

- [ ] **Step 2: Navigate to `/reports/outstanding`**

- [ ] **Step 3: Verify the new "สถานะ" dropdown includes "ทุกสถานะ / ค้างชำระ / ชำระบางส่วน / ชำระแล้ว", and selecting "ชำระแล้ว" shows only paid invoices**

- [ ] **Step 4: Verify the new "ประเภทใบแจ้งหนี้" dropdown lists all invoice types from the `invoice_types` table, and filtering by one narrows the rows correctly**

- [ ] **Step 5: Verify the "list" view table shows "วันที่ออกใบ" and "จ่ายล่าสุด" columns with correct values (cross-check one row's last-paid date against its payment history)**

- [ ] **Step 6: Switch to "จัดกลุ่มตามห้อง" (byRoom) view and verify the same two columns appear there**

- [ ] **Step 7: Resize to mobile width and verify the stacked cards show the "ออกใบ" / "จ่ายล่าสุด" line**

- [ ] **Step 8: Open the print view (toolbar print button) and verify the new columns render without breaking layout**

- [ ] **Step 9: Log in as (or impersonate, if the test setup allows) a `teacher` role and confirm the classroom scoping still restricts rows correctly with the new filters applied**

---

## Notes for the implementer

- Tasks 3 and 4 both touch `outstanding-report-panel.tsx` and are interdependent (Task 3's `invoiceTypeParam` reference doesn't exist until Task 4). Do not attempt to run the type-checker or tests between Task 3 and Task 4 — do them as one continuous unit of work, then verify once at the end of Task 4.
- Rows are now one-per-invoice rather than one-per-student, so every `key={row.studentId}` in this file must become `key={row.invoiceId}`: the mobile card wrapper (Step 7), the byRoom desktop table row (Step 8), and the list desktop table row (Step 9). All three are already called out explicitly in their respective steps above.

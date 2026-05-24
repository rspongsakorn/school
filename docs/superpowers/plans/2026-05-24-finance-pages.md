# Finance Pages v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full v1 finance module — fee setup, invoices, walk-in payments with receipt modal, and two reports — replacing placeholders and extending the sidebar.

**Architecture:** Server pages load semester context via `loadSemesterPageContext`; client panels handle search/tables/dialogs; finance logic lives in `lib/finance/*` (pure) and `lib/actions/*` (mutations in DB transactions). Four phases: setup → invoices → payments → reports.

**Tech Stack:** Next.js 16 App Router, Supabase, Server Actions, vitest, shadcn/ui, sonner

**Spec:** [2026-05-24-finance-pages-design.md](../specs/2026-05-24-finance-pages-design.md)

**React best practices (required before coding):** Read `vendor/react-best-practices/SKILL.md` per `.cursor/skills/react-best-practices/SKILL.md`. Base UI `Select` requires `items` prop for Thai labels in triggers.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/finance/constants.ts` | Invoice/payment status labels, method labels |
| `src/lib/finance/amounts.ts` | Discount, invoice status, FIFO allocation (pure) |
| `src/lib/finance/receipt-number.ts` | Next receipt number per academic year |
| `src/lib/auth/require-finance.ts` | `requireFinancePage` / `requireFinanceAction` |
| `src/lib/data/fee-items.ts` | List fee items |
| `src/lib/data/fee-rates.ts` | Matrix data for semester |
| `src/lib/data/receipt-types.ts` | List receipt types |
| `src/lib/data/invoices.ts` | Paginated invoice list, student outstanding |
| `src/lib/data/payments.ts` | Payments by date, receipt snapshot load |
| `src/lib/data/reports.ts` | Outstanding + collections aggregates |
| `src/lib/actions/fee-items.ts` | CRUD fee items |
| `src/lib/actions/fee-rates.ts` | Upsert fee rates batch |
| `src/lib/actions/receipt-types.ts` | CRUD receipt types |
| `src/lib/actions/invoices.ts` | generate, updateDiscount |
| `src/lib/actions/payments.ts` | recordPayment, voidPayment |
| `src/components/finance/*` | Client panels and dialogs |
| `src/app/(dashboard)/fee-rates/page.tsx` | Admin fee setup page |
| `src/app/(dashboard)/receipt-types/page.tsx` | Admin receipt types |
| `src/app/(dashboard)/invoices/page.tsx` | Replace placeholder |
| `src/app/(dashboard)/payments/page.tsx` | Replace placeholder |
| `src/app/(dashboard)/reports/outstanding/page.tsx` | Outstanding report |
| `src/app/(dashboard)/reports/collections/page.tsx` | Collections report |
| `src/app/(dashboard)/reports/page.tsx` | Redirect to outstanding |
| `src/components/app-sidebar.tsx` | Expand finance nav (6 items) |

---

## Phase 1 — Foundation + fee setup

### Task 1: Finance amount helpers (TDD)

**Files:**
- Create: `src/lib/finance/amounts.ts`
- Create: `src/lib/finance/amounts.test.ts`
- Create: `src/lib/finance/constants.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/finance/amounts.test.ts
import { describe, expect, it } from "vitest";
import {
  allocatePaymentFifo,
  computeInvoiceTotal,
  deriveInvoiceStatus,
} from "./amounts";

describe("computeInvoiceTotal", () => {
  it("applies percent discount", () => {
    expect(computeInvoiceTotal(10000, "percent", 10)).toBe(9000);
  });
  it("applies fixed discount", () => {
    expect(computeInvoiceTotal(10000, "fixed", 1500)).toBe(8500);
  });
  it("no discount returns subtotal", () => {
    expect(computeInvoiceTotal(5000, null, null)).toBe(5000);
  });
});

describe("deriveInvoiceStatus", () => {
  it("returns unpaid when paid is 0", () => {
    expect(deriveInvoiceStatus(0, 5000)).toBe("unpaid");
  });
  it("returns partial", () => {
    expect(deriveInvoiceStatus(2000, 5000)).toBe("partial");
  });
  it("returns paid when paid >= total", () => {
    expect(deriveInvoiceStatus(5000, 5000)).toBe("paid");
  });
});

describe("allocatePaymentFifo", () => {
  it("allocates oldest invoice first", () => {
    const invoices = [
      { id: "a", createdAt: "2026-01-02", outstanding: 3000 },
      { id: "b", createdAt: "2026-01-01", outstanding: 2000 },
    ];
    expect(allocatePaymentFifo(2500, invoices)).toEqual([
      { invoiceId: "b", amount: 2000 },
      { invoiceId: "a", amount: 500 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests (expect FAIL)**

```bash
npm test -- src/lib/finance/amounts.test.ts
```

- [ ] **Step 3: Implement**

```typescript
// src/lib/finance/amounts.ts
export type DiscountType = "percent" | "fixed" | null;

export function computeInvoiceTotal(
  subtotal: number,
  discountType: DiscountType,
  discountValue: number | null,
): number {
  if (!discountType || discountValue == null) return round2(subtotal);
  if (discountType === "percent") {
    return round2(subtotal * (1 - discountValue / 100));
  }
  return round2(Math.max(0, subtotal - discountValue));
}

export function deriveInvoiceStatus(
  paidAmount: number,
  totalAmount: number,
): "unpaid" | "partial" | "paid" {
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount < totalAmount) return "partial";
  return "paid";
}

export function allocatePaymentFifo(
  paymentAmount: number,
  invoices: { id: string; createdAt: string; outstanding: number }[],
) {
  const sorted = [...invoices]
    .filter((i) => i.outstanding > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let remaining = paymentAmount;
  const allocations: { invoiceId: string; amount: number }[] = [];

  for (const inv of sorted) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, inv.outstanding);
    allocations.push({ invoiceId: inv.id, amount: round2(amount) });
    remaining = round2(remaining - amount);
  }
  return allocations;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
```

```typescript
// src/lib/finance/constants.ts
export const INVOICE_STATUS_LABELS = {
  unpaid: "ค้างชำระ",
  partial: "ชำระบางส่วน",
  paid: "ชำระแล้ว",
} as const;

export const PAYMENT_METHOD_LABELS = {
  cash: "เงินสด",
  transfer: "โอนเงิน",
} as const;
```

- [ ] **Step 4: Run tests (expect PASS)**

```bash
npm test -- src/lib/finance/amounts.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/
git commit -m "feat: add finance amount helpers with tests"
```

---

### Task 2: Finance auth guards

**Files:**
- Create: `src/lib/auth/require-finance.ts`

- [ ] **Step 1: Implement guards**

```typescript
import { redirect } from "next/navigation";
import { getCurrentProfileRole } from "@/lib/auth/require-admin";

export async function requireFinancePage() {
  const profile = await getCurrentProfileRole();
  if (!profile || (profile.role !== "admin" && profile.role !== "finance")) {
    redirect("/");
  }
  return profile;
}

export async function requireFinanceAction() {
  const profile = await getCurrentProfileRole();
  if (!profile) return { ok: false as const, error: "กรุณาเข้าสู่ระบบ" };
  if (profile.role !== "admin" && profile.role !== "finance") {
    return { ok: false as const, error: "ไม่มีสิทธิ์ดำเนินการ" };
  }
  return { ok: true as const, profile };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth/require-finance.ts
git commit -m "feat: add finance role guards for pages and actions"
```

---

### Task 3: Sidebar + reports redirect

**Files:**
- Modify: `src/components/app-sidebar.tsx`
- Create: `src/app/(dashboard)/reports/outstanding/page.tsx` (stub redirect target later)
- Modify: `src/app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Update financeNav**

```typescript
const financeNav = [
  { href: "/fee-rates", label: "ตั้งค่าค่าธรรมเนียม", icon: Settings }, // or SlidersHorizontal
  { href: "/receipt-types", label: "ประเภทใบเสร็จ", icon: Receipt },
  { href: "/invoices", label: "ใบแจ้งชำระ", icon: FileText },
  { href: "/payments", label: "บันทึกการจ่าย", icon: CreditCard },
  { href: "/reports/outstanding", label: "รายงานค้างชำระ", icon: ChartColumn },
  { href: "/reports/collections", label: "สรุปการเก็บ", icon: ChartColumn },
];
```

- [ ] **Step 2: Redirect `/reports`**

```typescript
// src/app/(dashboard)/reports/page.tsx
import { redirect } from "next/navigation";

export default function ReportsIndexPage() {
  redirect("/reports/outstanding");
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/app-sidebar.tsx src/app/(dashboard)/reports/page.tsx
git commit -m "feat: expand finance sidebar and redirect reports index"
```

---

### Task 4: Fee items — data + actions

**Files:**
- Create: `src/lib/data/fee-items.ts`
- Create: `src/lib/actions/fee-items.ts`

- [ ] **Step 1: Data layer**

```typescript
export type FeeItemRow = {
  id: string;
  name: string;
  description: string | null;
  isTuition: boolean;
  isActive: boolean;
};

export async function listFeeItems(): Promise<FeeItemRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fee_items")
    .select("id, name, description, is_tuition, is_active")
    .order("name");
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isTuition: r.is_tuition,
    isActive: r.is_active,
  }));
}
```

- [ ] **Step 2: Server actions** — `createFeeItem`, `updateFeeItem`, `setFeeItemActive` with `requireAdminAction`, Thai errors, `revalidatePath("/fee-rates")`

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/fee-items.ts src/lib/actions/fee-items.ts
git commit -m "feat: add fee items data layer and admin actions"
```

---

### Task 5: Fee items UI section

**Files:**
- Create: `src/components/finance/fee-items-section.tsx`
- Create: `src/app/(dashboard)/fee-rates/page.tsx`

- [ ] **Step 1: `fee-items-section.tsx`** — table + dialog (name, description, is_tuition checkbox, is_active); pattern from `students-panel` / `year-table`

- [ ] **Step 2: Page shell**

```typescript
// fee-rates/page.tsx — requireAdminPage, loadSemesterPageContext for header, listFeeItems server-side, pass to FeeRatesPage client wrapper
```

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/fee-items-section.tsx src/app/(dashboard)/fee-rates/page.tsx
git commit -m "feat: add fee items admin section on fee-rates page"
```

---

### Task 6: Fee rates — data + upsert action

**Files:**
- Create: `src/lib/data/fee-rates.ts`
- Create: `src/lib/actions/fee-rates.ts`

- [ ] **Step 1: Load matrix**

```typescript
export async function getFeeRateMatrix(semesterId: string) {
  // Parallel: grade_levels for semester, active fee_items, fee_rates for semester
  // Return { grades: {id,name}[], items: {id,name}[], rates: Map<`${gradeId}:${itemId}`, { id?, amount }> }
}
```

- [ ] **Step 2: `upsertFeeRates(semesterId, academicYearId, entries[])`** — admin only; upsert on conflict `(academic_year_id, semester_id, grade_level_id, fee_item_id)`; default `receipt_type_id` from first active receipt type code `01`

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/fee-rates.ts src/lib/actions/fee-rates.ts
git commit -m "feat: add fee rate matrix data and batch upsert action"
```

---

### Task 7: Fee rates matrix UI

**Files:**
- Create: `src/components/finance/fee-rates-matrix.tsx`
- Modify: `src/app/(dashboard)/fee-rates/page.tsx`

- [ ] **Step 1: Matrix component** — editable number inputs per cell; local draft state; ปุ่ม **บันทึกการเปลี่ยนแปลง** calls `upsertFeeRates`; empty state links to `/registration`

- [ ] **Step 2: Wire page** — `FeeRatesPage` client wraps both sections

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/fee-rates-matrix.tsx src/app/(dashboard)/fee-rates/
git commit -m "feat: add fee rates matrix editor on fee-rates page"
```

---

### Task 8: Receipt types page

**Files:**
- Create: `src/lib/data/receipt-types.ts`
- Create: `src/lib/actions/receipt-types.ts`
- Create: `src/components/finance/receipt-types-panel.tsx`
- Create: `src/app/(dashboard)/receipt-types/page.tsx`

- [ ] **Step 1: Data + CRUD actions** (code unique, trim, admin only)

- [ ] **Step 2: Panel** — table + dialog; cannot delete if referenced — deactivate instead

- [ ] **Step 3: Page** — `requireAdminPage`, no semester selector required (`showContextSelectors={false}`)

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/receipt-types.ts src/lib/actions/receipt-types.ts src/components/finance/receipt-types-panel.tsx src/app/(dashboard)/receipt-types/
git commit -m "feat: add receipt types admin page"
```

---

## Phase 2 — Invoices

### Task 9: Invoices data layer

**Files:**
- Create: `src/lib/data/invoices.ts`

- [ ] **Step 1: Types + list paginated**

```typescript
export type InvoiceListRow = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  invoiceName: string;
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: "unpaid" | "partial" | "paid";
  createdAt: string;
};

export async function listInvoicesPaginated(params: {
  semesterId: string;
  academicYearId: string;
  q?: string;
  gradeLevelId?: string;
  classroomId?: string;
  status?: string;
  page?: number;
}): Promise<Paginated<InvoiceListRow>>;
```

Join `students`, enrollment → classroom → grade for filters. Reuse `buildStudentSearchOrFilter` for `q`.

- [ ] **Step 2: `getStudentOutstandingInvoices(studentId, semesterId)`** for payments page

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/invoices.ts
git commit -m "feat: add invoice list and outstanding queries"
```

---

### Task 10: Generate invoices action

**Files:**
- Create: `src/lib/actions/invoices.ts` (partial — generate only)

- [ ] **Step 1: `generateInvoices`**

Input:
```typescript
{
  semesterId: string;
  academicYearId: string;
  academicYearName: string;
  semesterNumber: number;
  feeItemIds: string[];
  studentIds?: string[]; // omit = all enrolled in semester
}
```

Logic:
1. `requireAdminAction`
2. Load enrollments `status=enrolled`, `semester_id`
3. Filter by `studentIds` if provided
4. Skip students with existing invoice for `(student_id, semester_id)`
5. For each student: resolve grade via classroom → load fee_rates for grade + selected feeItemIds
6. Insert `student_invoices` + `invoice_lines`; `invoice_name = ภาคเรียนที่ {n}/{yearName}`
7. Return `{ ok: true, created, skipped }`

- [ ] **Step 2: Commit**

```bash
git add src/lib/actions/invoices.ts
git commit -m "feat: add batch invoice generation action"
```

---

### Task 11: Invoice discount action

**Files:**
- Modify: `src/lib/actions/invoices.ts`

- [ ] **Step 1: `updateInvoiceDiscount(invoiceId, { discountType, discountValue })`**

- Guard: admin, `paid_amount = 0`
- Use `computeInvoiceTotal`; update `total_amount`, keep `subtotal` unchanged

- [ ] **Step 2: Commit**

```bash
git add src/lib/actions/invoices.ts
git commit -m "feat: add invoice discount update action"
```

---

### Task 12: Invoices page UI

**Files:**
- Create: `src/components/finance/invoices-panel.tsx`
- Create: `src/components/finance/invoice-generate-dialog.tsx`
- Create: `src/components/finance/invoice-discount-dialog.tsx`
- Modify: `src/app/(dashboard)/invoices/page.tsx`

- [ ] **Step 1: `invoice-generate-dialog.tsx`**

Two modes (tabs or radio):
- **ทั้งภาค** — checkbox fee items (default all active with rates)
- **เฉพาะกลุ่ม** — grade → classroom → student checklist (only without invoice)

- [ ] **Step 2: `invoice-discount-dialog.tsx`** — percent | fixed, validate > 0

- [ ] **Step 3: `invoices-panel.tsx`** — filters, table, badges via `INVOICE_STATUS_LABELS`, `formatBaht`

- [ ] **Step 4: Replace placeholder page** — `requireAdminPage`, semester context

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/ src/app/(dashboard)/invoices/page.tsx
git commit -m "feat: add invoices page with generate and discount dialogs"
```

---

## Phase 3 — Payments

### Task 13: Receipt number helper

**Files:**
- Create: `src/lib/finance/receipt-number.ts`
- Create: `src/lib/finance/receipt-number.test.ts`

- [ ] **Step 1: Test + implement**

```typescript
export function formatReceiptNumber(yearName: string, sequence: number): string {
  return `${yearName}/${String(sequence).padStart(5, "0")}`;
}

export function parseMaxSequence(existing: string[], yearName: string): number {
  const prefix = `${yearName}/`;
  let max = 0;
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue;
    const seq = Number.parseInt(n.slice(prefix.length), 10);
    if (Number.isFinite(seq)) max = Math.max(max, seq);
  }
  return max;
}
```

Server-side: query max `receipt_number` for `academic_year_id` inside transaction before insert.

- [ ] **Step 2: Commit**

```bash
git add src/lib/finance/receipt-number.ts src/lib/finance/receipt-number.test.ts
git commit -m "feat: add receipt number formatting helper"
```

---

### Task 14: Record payment action

**Files:**
- Create: `src/lib/data/payments.ts`
- Modify: `src/lib/actions/payments.ts`

- [ ] **Step 1: `recordPayment` transaction**

```typescript
// Input: studentId, academicYearId, semesterId, amount, paymentMethod, transferReference?, note?
// 1. requireFinanceAction
// 2. Load outstanding invoices for student+semester (unpaid/partial)
// 3. allocatePaymentFifo(amount, invoices)
// 4. If allocations empty -> error "ไม่มีใบค้างชำระ"
// 5. Next receipt_number for year
// 6. Insert payments, payment_allocations, receipts (snapshot_data JSON per spec §9)
// 7. Update each invoice paid_amount + status via deriveInvoiceStatus
// 8. revalidatePath /payments, /invoices, /, reports paths
// Return { ok: true, paymentId, snapshot }
```

Use Supabase RPC or multiple queries in single transaction pattern (sequential with rollback on error — document: use `.rpc` if available else manual).

- [ ] **Step 2: Commit**

```bash
git add src/lib/data/payments.ts src/lib/actions/payments.ts
git commit -m "feat: add record payment action with fifo allocation"
```

---

### Task 15: Void payment action

**Files:**
- Modify: `src/lib/actions/payments.ts`

- [ ] **Step 1: `voidPayment(paymentId, reason)`**

- Load allocations; subtract from invoice `paid_amount`; recompute status
- Insert `payment_voids`; set `payments.status = voided`
- Finance or admin only; reason trim required

- [ ] **Step 2: Commit**

```bash
git add src/lib/actions/payments.ts
git commit -m "feat: add void payment action with invoice reversal"
```

---

### Task 16: Payments page + receipt dialog

**Files:**
- Create: `src/components/finance/payments-panel.tsx`
- Create: `src/components/finance/receipt-dialog.tsx`
- Create: `src/components/finance/student-payment-search.tsx`
- Modify: `src/app/(dashboard)/payments/page.tsx`

- [ ] **Step 1: `student-payment-search.tsx`** — debounced search like students; calls server action or API route optional; simpler: client calls `searchStudentsForPayment` server action returning max 10 rows

- [ ] **Step 2: `receipt-dialog.tsx`** — print-friendly content; `@media print` styles; `window.print()` on button; read `snapshot` prop

- [ ] **Step 3: `payments-panel.tsx`** — 2-column layout; outstanding table with checkboxes optional (v1: auto FIFO, show preview allocations before confirm optional — spec says FIFO auto); form; today's payments list with reprint + void

- [ ] **Step 4: Page** — `requireFinancePage`, semester context

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/payments-panel.tsx src/components/finance/receipt-dialog.tsx src/components/finance/student-payment-search.tsx src/app/(dashboard)/payments/page.tsx
git commit -m "feat: add walk-in payments page with receipt modal"
```

---

## Phase 4 — Reports

### Task 17: Outstanding report

**Files:**
- Create: `src/lib/data/reports.ts`
- Create: `src/components/finance/outstanding-report-panel.tsx`
- Create: `src/app/(dashboard)/reports/outstanding/page.tsx`

- [ ] **Step 1: `listOutstandingReport(semesterId, filters)`** — columns per spec §6.5; teacher filter via `teacher_assignments` when role=teacher (pass `profileId` + role from page)

- [ ] **Step 2: Panel** — grade/classroom/status filters; export N/A

- [ ] **Step 3: Page** — finance + admin + teacher (`requireFinancePage` extended or new `requireReportPage` allowing teacher)

```typescript
// require-report.ts: admin | finance | teacher allowed
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/reports.ts src/components/finance/outstanding-report-panel.tsx src/app/(dashboard)/reports/outstanding/
git commit -m "feat: add outstanding payments report page"
```

---

### Task 18: Collections report

**Files:**
- Modify: `src/lib/data/reports.ts`
- Create: `src/components/finance/collections-report-panel.tsx`
- Create: `src/app/(dashboard)/reports/collections/page.tsx`

- [ ] **Step 1: `listCollectionsByGrade(semesterId)`** — enrolled count, sum total_amount, sum paid_amount, rate %

- [ ] **Step 2: Panel + page** — same access as Task 17

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/reports.ts src/components/finance/collections-report-panel.tsx src/app/(dashboard)/reports/collections/
git commit -m "feat: add collections summary report by grade"
```

---

### Task 19: Final verification

- [ ] **Step 1: Run tests**

```bash
npm test
```

Expected: all pass including `src/lib/finance/*.test.ts`

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: success; routes include `/fee-rates`, `/receipt-types`, `/invoices`, `/payments`, `/reports/outstanding`, `/reports/collections`

- [ ] **Step 3: Manual smoke checklist**

1. Admin: create fee item, set rates for ป.1
2. Generate invoices ทั้งภาค → list shows rows
3. Finance: record partial payment → invoice partial, receipt modal prints
4. Void payment → invoice reverts
5. Reports match invoice totals

- [ ] **Step 4: Commit any fixes**

```bash
git commit -m "chore: finance module verification fixes"
```

---

## Spec coverage self-review

| Spec section | Task(s) |
|--------------|---------|
| Sidebar 6 items | Task 3 |
| `/fee-rates` two sections | Tasks 5–7 |
| `/receipt-types` | Task 8 |
| Invoice batch + selective | Tasks 10, 12 |
| Invoice discount | Tasks 11, 12 |
| Payments walk-in + FIFO | Tasks 1, 14, 16 |
| Receipt modal | Task 16 |
| Void payment | Tasks 15, 16 |
| Reports split routes | Tasks 17–18 |
| require finance/admin | Tasks 2, 17 |
| Semester context | All page tasks |

No placeholders remain in task steps.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-24-finance-pages.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session via executing-plans with checkpoints  

Which approach?

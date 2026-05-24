# Invoice Delete After Void Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow deleting invoices with full outstanding balance after all related receipts are voided, while keeping voided payment audit records.

**Architecture:** Extend `canDeleteInvoice` to check `hasActivePaymentAllocation`; add data helper to load delete context; update `deleteInvoices` to remove voided `payment_allocations` before deleting `student_invoices`; align invoices panel UI and messages.

**Tech Stack:** Next.js App Router, Supabase, Vitest, existing finance module patterns.

**React best practices (required before coding):** Read `vendor/react-best-practices/` per `.cursor/skills/react-best-practices/SKILL.md`.

**Spec:** [2026-05-24-invoice-delete-after-void-design.md](../specs/2026-05-24-invoice-delete-after-void-design.md)

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/lib/finance/invoice-delete-eligibility.ts` | Pure delete rules + blocked reason |
| `src/lib/finance/invoice-delete-eligibility.test.ts` | Unit tests |
| `src/lib/data/invoices.ts` | `getInvoiceDeleteContext()` query |
| `src/lib/actions/invoices.ts` | `deleteInvoices` — voided alloc cleanup + delete |
| `src/components/finance/invoices-panel.tsx` | UI eligibility, dialog copy, tooltips |

---

### Task 1: Eligibility helper (TDD)

**Files:**
- Modify: `src/lib/finance/invoice-delete-eligibility.ts`
- Modify: `src/lib/finance/invoice-delete-eligibility.test.ts`

- [ ] **Step 1: Write failing tests**

Add cases:
- `paidAmount=0`, no active allocation → `true`
- `paidAmount=0`, `hasActivePaymentAllocation=true` → `false`, reason mentions void receipts
- `paidAmount>0` → `false`, reason mentions void all receipts
- tolerance edge: `paidAmount=0.001` with total 100 → false

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- src/lib/finance/invoice-delete-eligibility.test.ts`

- [ ] **Step 3: Implement**

```ts
export type InvoiceDeleteContext = {
  paidAmount: number;
  totalAmount: number;
  hasActivePaymentAllocation: boolean;
};

export function canDeleteInvoice(ctx: InvoiceDeleteContext): boolean;
export function invoiceDeleteBlockedReason(ctx: InvoiceDeleteContext): string | null;
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/invoice-delete-eligibility.ts src/lib/finance/invoice-delete-eligibility.test.ts
git commit -m "feat: invoice delete eligibility after void receipts"
```

---

### Task 2: Delete context query

**Files:**
- Modify: `src/lib/data/invoices.ts`

- [ ] **Step 1: Add `getInvoiceDeleteContext(invoiceIds: string[])`**

Query `student_invoices` for `id, paid_amount, total_amount`.
Query `payment_allocations` join `payments` where `invoice_id IN (...)` and `payments.status = 'active'`.
Return `Map<string, { paidAmount, totalAmount, hasActivePaymentAllocation }>`.

- [ ] **Step 2: Manual sanity** (optional quick script or log in dev)

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/invoices.ts
git commit -m "feat: load invoice delete context for active allocations"
```

---

### Task 3: Update deleteInvoices action

**Files:**
- Modify: `src/lib/actions/invoices.ts`

- [ ] **Step 1: Use `getInvoiceDeleteContext` + new eligibility**

Replace `paid_amount`-only filter.

- [ ] **Step 2: Per deletable invoice, before delete:**

```ts
// Delete allocations linked to voided payments only
await supabase
  .from("payment_allocations")
  .delete()
  .eq("invoice_id", id)
  .in("payment_id", voidedPaymentIds); // or subquery filter
```

Preferred: select allocation ids where payment.status = 'voided', then delete by id.

- [ ] **Step 3: Delete `student_invoices`**

Keep bulk behavior with `deleted` / `skipped` counts.

- [ ] **Step 4: Run build**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/invoices.ts
git commit -m "feat: delete invoices after clearing voided allocations"
```

---

### Task 4: Invoices panel UI

**Files:**
- Modify: `src/components/finance/invoices-panel.tsx`

- [ ] **Step 1: Extend `InvoiceListRow` or pass delete context from page**

Option A (minimal): add `hasActivePaymentAllocation` to list query in `listInvoicesPaginated`.
Option B: server page loads context map — prefer **Option A** in list query subselect for simplicity.

- [ ] **Step 2: Replace `canDeleteInvoice(row.paidAmount)` with full context**

Use `invoiceDeleteBlockedReason` for disabled tooltips (title attribute).

- [ ] **Step 3: Update confirm dialog**

Add line when invoice may have void history: *"ประวัติใบเสร็จที่ยกเลิกแล้วจะยังอยู่ในระบบ"*

- [ ] **Step 4: Run build + manual smoke**

Run: `npm run build`

Manual:
1. Pay → void → delete invoice ✓
2. Partial pay → delete blocked ✓
3. Active receipt → delete blocked ✓

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/invoices-panel.tsx src/lib/data/invoices.ts
git commit -m "fix: show invoice delete when voided receipts cleared"
```

---

### Task 5: Verification

- [ ] Run `npm test`
- [ ] Run `npm run build`
- [ ] Document any data-fix note if old voided invoices still have allocations (expected — delete path handles them)

# Student default "เบิกได้" (reimbursable) flag — design

Date: 2026-07-05

## Problem

"เบิกได้ / เบิกไม่ได้" (reimbursable) is currently recorded **per invoice** only
(`student_invoices.is_reimbursable`). When generating invoices, the operator must
re-tick which students are reimbursable every single time in the invoice-generate
dialog — the system does not remember it. There is no persistent, student-level
notion of "this child is reimbursable."

## Goal

Let the operator record **once, on the student**, that a child is reimbursable, so
that future invoice generation pre-selects that child automatically.

## Decisions (agreed with user)

- **Behavior (Q1 → option A):** the student flag is a **default that stays
  editable** at generation time. Students marked reimbursable come pre-ticked in
  the generate dialog, but the operator can still toggle any student for that
  batch.
- **Where to set it (Q2 → location 1):** on the **student profile form only**
  (create + edit). CSV import is out of scope.
- **Students table badge:** show a small "เบิกได้" badge in the students list so the
  flag is visible at a glance.

## Non-goals (YAGNI)

- No change to CSV import.
- No back-filling / rewriting of existing invoices. The flag only affects the
  *default selection* when new invoices are generated; already-issued invoices keep
  their own `is_reimbursable` value and remain editable via the existing
  per-invoice dialog.
- No change to the reimbursable price-calculation logic.

## Part 1 — Database

New migration under `supabase/migrations/` (timestamp `20260705000000`):

```sql
ALTER TABLE public.students
  ADD COLUMN is_reimbursable boolean NOT NULL DEFAULT false;
```

Existing students default to `false` (เบิกไม่ได้), which matches current behavior
(nobody is reimbursable until explicitly ticked). No data migration needed.

## Part 2 — Setting the value (student profile form)

Add a **"เบิกได้" switch** to the student form, shown in both create and edit modes,
placed after the status field.

Files:

- `src/components/students/student-sheet.tsx`
  - Add the switch field (reuse existing Switch/Checkbox UI component).
  - Extend `StudentFormState` / `initialForm` / `buildInitialForm` with
    `isReimbursable` (default `false`; in edit mode read from `initial`).
  - Extend the `initial` prop type with `isReimbursable: boolean`.
- `src/lib/students/validation.ts`
  - Add `isReimbursable: boolean` to `StudentFormInput`. No new validation rule
    (it's a boolean).
- `src/lib/actions/students.ts`
  - `createStudent` and `updateStudent` write `is_reimbursable` to the `students`
    table.
- `src/lib/data/students.ts`
  - Add `isReimbursable: boolean` to `StudentListRow`.
  - Select `is_reimbursable` in both `listStudents` and `listStudentsPaginated`,
    and map it in `mapStudentRow`.
- `src/app/(dashboard)/students/page.tsx` (and any client fetch path, e.g.
  `fetchStudentsPaginated`) — ensure the flag flows through so the edit sheet
  pre-fills the switch with the saved value.

## Part 2b — Students table badge

In `src/components/students/students-panel.tsx`, render a small "เบิกได้" badge next
to the existing status badge, in **both** the mobile card view and the desktop
table view, shown only when `student.isReimbursable` is true. Reuse the existing
`Badge` component with a distinct color (e.g. sky, matching the "เบิกได้" accent
already used in the generate dialog).

## Part 3 — Using the value at invoice generation (option A)

- `src/lib/data/invoices.ts`
  - Add `defaultReimbursable: boolean` to `InvoiceCandidateRow`.
  - In `listInvoiceCandidates`, extend the `students!inner ( ... )` select to
    include `is_reimbursable`, and map it into `defaultReimbursable`.
- `src/components/finance/invoice-generate-dialog.tsx`
  - When the dialog opens (the reset `useEffect`), initialize
    `reimbursableStudentIds` with the ids of all candidates whose
    `defaultReimbursable` is `true`, instead of an empty set.

Result: reimbursable students come pre-ticked. The operator can still add/remove
individual students, and the existing "สลับเบิกได้ทุกคน" button keeps working — only
the default changes from "empty" to "as configured on the student."

## Data flow summary

```
students.is_reimbursable  (persistent, set on profile form)
        │
        ├─► students list  ──► "เบิกได้" badge
        │
        └─► listInvoiceCandidates.defaultReimbursable
                │
                └─► invoice-generate dialog: pre-ticks reimbursableStudentIds
                        │
                        └─► generateInvoices writes per-invoice is_reimbursable
                            (still editable per batch / per invoice afterward)
```

## Testing

- Validation type change: existing `student.validation` tests still pass with the
  new boolean field defaulted.
- Manual/preview check: create a student with "เบิกได้" on → appears with badge in
  table → open generate dialog → that student is pre-ticked in the "เบิก" column →
  untick works → generated invoice reflects the final selection.

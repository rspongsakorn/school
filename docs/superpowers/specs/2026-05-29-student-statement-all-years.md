# Spec: Student Statement — All-Years View

**Date:** 2026-05-29

## Goal

Allow users to view a student's invoice and payment history across all academic years in a single page, without switching the global semester context.

## Scope

- **In scope:** `StudentStatementPanel` (individual student page at `/reports/students/[studentId]`)
- **Out of scope:** `StudentRosterPanel` (list page) — unchanged

---

## UI Changes — `StudentStatementPanel`

### Toggle
Add a two-option toggle near the top of the panel (below the letterhead, above the student info card):

| Option | Label | Behaviour |
|--------|-------|-----------|
| `semester` | ปีที่เลือก | Current behaviour — filtered by active semester context |
| `all` | ทุกปีการศึกษา | Fetches all years; adds year/semester column to tables |

Toggle state is local (`useState`), defaults to `"semester"`, not written to URL.

### Table changes when `all` is active

**ค่าใช้จ่าย table** — add a **"ปี/ภาค"** column (first column) showing e.g. `"2567 ภาค 1"`. Rows grouped/sorted chronologically by year then semester number.

**ประวัติการชำระ table** — add a **"ปี/ภาค"** column (second column, after วันที่). Sorted by `paid_at` ascending.

**Summary block** (รวมต้องชำระ / ชำระแล้ว / คงค้าง) — shows totals across all years.

**ReportLetterhead** — when `all` is active, omit `yearName` and `semesterNumber` props so it doesn't show a specific year.

---

## Data Layer

### Type additions

Extend existing types with an optional `yearLabel` field (only populated in all-years queries):

```ts
export type StatementLine = {
  description: string;
  amount: number;
  yearLabel?: string;   // e.g. "2567 ภาค 1"
};

export type StatementPayment = {
  paidAt: string;
  dateLabel: string;
  receiptNumber: string;
  method: "cash" | "transfer";
  amount: number;
  status: "active" | "voided";
  yearLabel?: string;   // e.g. "2567 ภาค 1"
};
```

### New query function

```ts
fetchStudentStatementAllYears(studentId: string): Promise<StudentStatement | null>
```

- Fetches `student_invoices` without `.eq("semester_id")` / `.eq("academic_year_id")` filter
- Joins `academic_years` (for `name`) and `semesters` (for `number`) to build `yearLabel`
- Fetches `payments` without semester filter, joins same year/semester data for `yearLabel`
- Returns same `StudentStatement` shape — `lines` and `payments` include `yearLabel`
- `gradeClassroom` — use the most recent enrollment found across all semesters (best-effort)

### Query key

```ts
["student-statement-all-years", studentId]
```

---

## Component wiring

In `StudentStatementPanel`:

```ts
const [mode, setMode] = useState<"semester" | "all">("semester");

const { data: s } = useQuery({
  queryKey: mode === "semester"
    ? ["student-statement", studentId, ctx?.semesterId, ctx?.academicYearId]
    : ["student-statement-all-years", studentId],
  queryFn: () =>
    mode === "semester"
      ? fetchStudentStatement(studentId, ctx!.semesterId, ctx!.academicYearId)
      : fetchStudentStatementAllYears(studentId),
  enabled: mode === "all" || !!ctx,
});
```

When `mode === "all"`, the query runs even without a semester context (e.g. no academic year set up yet).

---

## Error / edge cases

| Case | Behaviour |
|------|-----------|
| Student has no invoices in any year | Show "ไม่พบข้อมูล" as today |
| Student has invoices but no payments | Payments table shows "ยังไม่มีการชำระ" |
| `ctx` is null (no academic year in system) | `semester` mode shows "ยังไม่มีปีการศึกษา"; `all` mode still works |

---

## Files to change

| File | Change |
|------|--------|
| `src/lib/queries/reports.ts` | Add `yearLabel?` to `StatementLine` and `StatementPayment` types; add `fetchStudentStatementAllYears` |
| `src/components/finance/student-statement-panel.tsx` | Add mode toggle, conditional columns, conditional query |

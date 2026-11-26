# Finance report fixes 1–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-student report one row per student, make the outstanding report default to invoices still owed (with a totals row), and stop the collections report from showing zeros while it loads.

**Architecture:** All three are front-end fixes on top of the existing `fetchOutstandingReport` query. Two small pure modules in `src/lib/reports/` carry the logic so it can be unit-tested; the panels only wire them in.

**Tech Stack:** Next.js 16, React, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-finance-report-fixes-design.md`

## Global Constraints

- No database change, no migration.
- Totals must not move: the term-1/2569 outstanding total on the `school` test project is ฿864,575 on both the outstanding report and the per-student report.
- UI copy is Thai; new option labels exactly: `ยังค้างชำระ` (default), `ยังไม่ชำระ` (status `unpaid`), `ชำระบางส่วน`, `ชำระแล้ว`, `ทุกสถานะ` — in that order.
- Default (no `status` param) means "still owed"; "all statuses" is `status=all` in the URL.
- Dev server for browser checks is `npm run dev:school` (launch config `dev-school`), never `.env.local`.

## Review Focus

- A student with one fully paid invoice and one unpaid invoice must read as `partial` in the per-student report and appear under the `ชำระบางส่วน` filter, not under `ชำระแล้ว` or `ยังไม่ชำระ` — test in Task 1.
- A student whose only invoice is ฿0 must read as `paid`, not `unpaid` — test in Task 1.
- Search and status filter together: searching a code whose student is `paid` while filtering `unpaid` returns nothing — test in Task 1.
- Old bookmarks `?status=unpaid|partial|paid` on the outstanding report keep meaning exactly that one status — test in Task 2.
- An unknown `status` value in the URL falls back to the default (`outstanding`), not to all statuses — test in Task 2.

---

### Task 1: Per-student report shows one row per student

**Files:**
- Create: `src/lib/reports/roster.ts`
- Test: `src/lib/reports/roster.test.ts`
- Modify: `src/lib/queries/reports.ts` (`fetchStudentRoster`, ~lines 566–606)

**Interfaces:**
- Consumes: `aggregateOutstandingByStudent(rows: OutstandingReportRow[]): PerStudentOutstandingRow[]` from `src/lib/reports/per-student.ts` (already sorts by student code); `OutstandingReportRow`, `StudentRosterRow` from `src/lib/queries/reports.ts`.
- Produces: `buildStudentRoster(rows: OutstandingReportRow[], opts: { status?: "unpaid" | "partial" | "paid" | "all"; query?: string }): StudentRosterRow[]`

- [ ] **Step 1: Write the failing tests** in `roster.test.ts`, reusing the `row()` factory shape from `per-student.test.ts`:
  - `collapses a student's invoices into one row` — two invoices for `stu-1` (paid ฿2,900; ฿0 invoice) → length 1, `totalAmount 2900, paidAmount 2900, outstanding 0, status "paid"`.
  - `filters on the student's combined status, after collapsing` — `stu-1`: one paid ฿4,600 + one unpaid ฿200; `stu-2`: one unpaid ฿200. `status:"partial"` → only `stu-1` with `outstanding 200`; `status:"unpaid"` → only `stu-2`; `status:"paid"` → empty.
  - `a student whose only invoice is zero reads as paid` — one invoice all zeros → `status "paid"`.
  - `searches name or code, case-insensitive, combined with status` — query `"13705"` matches by code; query on part of the Thai name matches; query `"13705"` with `status:"unpaid"` when that student is paid → empty.
  - `sorts by student code numerically` — codes `"12400"`, `"9999"` → `"9999"` first.

- [ ] **Step 2: Run to see them fail**
  Run: `npx vitest run src/lib/reports/roster.test.ts`
  Expected: FAIL, cannot resolve `./roster`.

- [ ] **Step 3: Implement `buildStudentRoster` in `src/lib/reports/roster.ts`** — order is: aggregate → status filter (skip when `"all"` or undefined) → trimmed lower-case query on name/code → map to `StudentRosterRow`.

- [ ] **Step 4: Run to see them pass**
  Run: `npx vitest run src/lib/reports/roster.test.ts`
  Expected: PASS (5 tests).

- [ ] **Step 5: Wire it into `fetchStudentRoster`** — call `fetchOutstandingReport` with `status: "all"`, `includeAllStatuses: true` (never pass the roster's status down), then `return buildStudentRoster(rows, { status: params.status, query: params.query })`.

- [ ] **Step 6: Full checks**
  Run: `npm test` then `npx tsc --noEmit` then `npm run lint`
  Expected: all pass, no new lint errors.

- [ ] **Step 7: Commit**
  ```bash
  git add src/lib/reports/roster.ts src/lib/reports/roster.test.ts src/lib/queries/reports.ts
  git commit -m "fix(reports): one row per student on the per-student report"
  ```

### Task 2: Outstanding report defaults to "still owed" and gets a totals row

**Files:**
- Create: `src/lib/reports/outstanding-status.ts`
- Test: `src/lib/reports/outstanding-status.test.ts`
- Modify: `src/components/finance/outstanding-report-panel.tsx` (`STATUS_ITEMS` ~43–48, status parsing ~83–87, `pushParams` ~171–172, query call ~113–123, list-view table ~564–634)

**Interfaces:**
- Produces:
  - `type OutstandingStatusFilter = "outstanding" | "unpaid" | "partial" | "paid" | "all"`
  - `parseOutstandingStatus(raw: string | null): OutstandingStatusFilter` — `null`/unknown → `"outstanding"`.
  - `outstandingStatusQuery(filter: OutstandingStatusFilter): { status: "unpaid" | "partial" | "paid" | "all"; includeAllStatuses: boolean }` — `outstanding` → `{status:"all", includeAllStatuses:false}`; `all` → `{status:"all", includeAllStatuses:true}`; a single status → `{status, includeAllStatuses:true}`.
  - `OUTSTANDING_STATUS_ITEMS: { value: OutstandingStatusFilter; label: string }[]` — the five labels from Global Constraints, in that order.

- [ ] **Step 1: Write the failing tests** in `outstanding-status.test.ts`:
  - `defaults to outstanding when the param is missing` — `parseOutstandingStatus(null) === "outstanding"`.
  - `keeps old single-status bookmarks` — `"unpaid"`, `"partial"`, `"paid"` parse to themselves.
  - `reads all explicitly` — `"all"` → `"all"`.
  - `falls back to outstanding on an unknown value` — `"bogus"` → `"outstanding"`.
  - `maps each filter to the query's arguments` — the three mappings above, asserted with `toEqual`.
  - `lists the options in the agreed order and wording` — `OUTSTANDING_STATUS_ITEMS.map(i => i.label)` equals `["ยังค้างชำระ","ยังไม่ชำระ","ชำระบางส่วน","ชำระแล้ว","ทุกสถานะ"]`.

- [ ] **Step 2: Run to see them fail**
  Run: `npx vitest run src/lib/reports/outstanding-status.test.ts`
  Expected: FAIL, cannot resolve module.

- [ ] **Step 3: Implement `src/lib/reports/outstanding-status.ts`** with the three exports above.

- [ ] **Step 4: Run to see them pass**
  Run: `npx vitest run src/lib/reports/outstanding-status.test.ts`
  Expected: PASS (6 tests).

- [ ] **Step 5: Wire the panel** — replace local `STATUS_ITEMS` with `OUTSTANDING_STATUS_ITEMS`; `statusParam = parseOutstandingStatus(searchParams.get("status"))`; spread `outstandingStatusQuery(statusParam)` into the `fetchOutstandingReport` call in place of `status` / `includeAllStatuses: true`; in `pushParams` delete the `status` param when the value is `"outstanding"` and set it otherwise (so `all` writes `status=all`). The query key keeps `statusParam`.

- [ ] **Step 6: Add the totals row to the list view** — last row of the desktop list table (only when not loading and rows exist): first cell `รวม {rows.length} ใบ` spanning the ลำดับ/รหัส/ชื่อ/ชั้น columns, then sums of `subtotal`, `totalAmount`, `paidAmount`, `outstanding` in their columns, empty cells for the rest; styling `border-t-2 font-semibold` like the per-student view's total row.

- [ ] **Step 7: Full checks**
  Run: `npm test` then `npx tsc --noEmit` then `npm run lint`
  Expected: all pass.

- [ ] **Step 8: Commit**
  ```bash
  git add src/lib/reports/outstanding-status.ts src/lib/reports/outstanding-status.test.ts src/components/finance/outstanding-report-panel.tsx
  git commit -m "fix(reports): outstanding report opens on what is still owed, with a total"
  ```

### Task 3: Collections report never shows zeros while loading

**Files:**
- Modify: `src/components/finance/collections-report-panel.tsx` (queries ~70–92, render branches ~125–231)

**Interfaces:**
- Consumes: `TableSkeleton` from `@/components/ui/skeleton` (already used by other report panels).

- [ ] **Step 1: Take `isLoading` from the summary and classroom queries** (name them `summaryLoading`, `classroomLoading`).

- [ ] **Step 2: Render** — `level === "all"`: while `summaryLoading` show the same `h-40 animate-pulse rounded-lg bg-muted` block the grade view uses, instead of the cards. `level === "classroom"`: while `classroomLoading` the same block; when loaded and `classroomRows.length === 0` show `<p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูล</p>`; otherwise the existing table/cards.

- [ ] **Step 3: Checks**
  Run: `npx tsc --noEmit` then `npm run lint`
  Expected: pass. (No unit test: this is render-state only; Task 4 checks it in the browser.)

- [ ] **Step 4: Commit**
  ```bash
  git add src/components/finance/collections-report-panel.tsx
  git commit -m "fix(reports): collections shows loading, not zeros"
  ```

### Task 4: Browser verification on the test project

**Files:** none.

- [ ] **Step 1:** Start `dev-school`, sign in as admin (the user signs in), term 1/2569.
- [ ] **Step 2: Per-student** `/reports/students` — row count equals distinct student codes (expect ~926, not 1,857); code 14297 appears once with ต้องชำระ ฿2,900; no "same key" errors in the console; sum of ค้าง column = ฿864,575.
- [ ] **Step 3: Outstanding** `/reports/outstanding` — status select shows `ยังค้างชำระ`; no row has status ชำระแล้ว; list total row ค้าง = ฿864,575; choosing ทุกสถานะ puts `status=all` in the URL and shows 1,857 rows; `?status=unpaid` still works.
- [ ] **Step 4: Collections** `/reports/collections` — switch to ทั้งหมด and to ตามห้อง: a loading block shows, never `0` / `฿0` / `0%`; final numbers 919 / ฿3,064,605 / ฿2,200,030 / ฿864,575 / 71.79%.
- [ ] **Step 5:** Screenshot each page for the user; leave the semester selector on ภาค 1.

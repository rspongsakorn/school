# Report overlap and teacher navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Remove the duplicate per-student view, say how the two room reports differ, and let teachers open every report their menu offers.
**Spec:** `docs/superpowers/specs/2026-11-26-report-overlap-and-teacher-nav-design.md`
**Constraints:** no DB change; lint ≤ 24.

## Review Focus
- `/reports/students-x` or `/reports/studentsfoo` must not pass the teacher guard — Task 1 test.
- A bookmark `?view=perStudent&status=paid&grade=…` lands on the roster with the same status/grade — Task 2 test.
- Outstanding default (no status param) maps to roster `status=outstanding`; `status=all` maps to no status param — Task 2 test.

### Task 1: teacher route guard
Create `src/lib/auth/teacher-routes.ts` + test: `teacherMayVisit(pathname: string): boolean`. Use it in `src/app/(dashboard)/layout.tsx`; fallback stays `/reports/outstanding`.

### Task 2: link helpers
In `src/lib/reports/url-filters.ts` add `pickQuery(query: string, keys: string[]): string` and `rosterQueryFromOutstanding(query: string): string` (keeps year, semester, grade, classroom; status: missing/outstanding→"outstanding", all→omitted, others kept; drops variant, invoiceType, view). Tests first.

### Task 3: panels
Outstanding: remove the perStudent view (state, query key, tables, cards), add link + redirect for old `view=perStudent`, add scope note linking to debtors. Remove `perStudentRowsFor` and the `view` param of `outstandingStatusQuery` with their tests. Debtors: replace the small note with scope note linking to outstanding (`view=byRoom`).

### Task 4: browser check; Task 5: review.

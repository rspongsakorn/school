# Report navigation fixes 5–7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Report filters survive Back/refresh, the sidebar shows which report you are on, and the student statement keeps you on the student and can take you back to the filtered roster.

**Architecture:** One pure module (`src/lib/reports/url-filters.ts`) owns query-string merging, param parsing and the roster/statement links; a thin hook writes it to the router; the four panels read their filters from `useSearchParams` instead of `useState`.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-report-navigation-fixes-design.md`

## Global Constraints

- No database change.
- Filter changes from selects/dates use `router.push`; the search box debounces 300 ms and uses `router.replace`.
- A filter at its default is absent from the URL; other params (`year`, `semester`, …) are kept.
- Param names: daily `from` `to` `method` `doc`; discounts `from` `to`; collections `level`; roster `grade` `classroom` `status` `q`.
- Lint: no new problems over the current 24.

## Review Focus

- A hand-edited or stale URL (`?from=2026-13-40`, `?doc=bogus`, `?status=x`, `?level=x`) falls back to the default instead of breaking the page — Task 1 parser tests.
- Changing semester on the roster clears `grade`/`classroom` (ids belong to one semester) but keeps `status` and `q` — Task 3 (`clearGradeClassroomOnChange`) + browser check.
- Typing in the roster search must not add one history entry per keystroke, and the box must not lose characters typed while the URL catches up — Task 3, browser check.
- The statement's back link must not carry `year`/`semester` from a different term than the one the statement now shows — it carries the statement's current params, so the roster opens on the term the user ended on — Task 1 test.
- The sidebar must still let the user collapse the open group — Task 2 browser check.

---

### Task 1: url-filters module

**Files:** Create `src/lib/reports/url-filters.ts`, `src/lib/reports/url-filters.test.ts`

**Produces:**
- `mergeQuery(current: string, next: Record<string, string | undefined>, defaults: Record<string, string>): string` — no leading `?`; a key whose value is `undefined`, `""` or equal to `defaults[key]` is deleted.
- `parseDateParam(raw: string | null, fallback: string): string` — accepts only a real calendar date `YYYY-MM-DD`.
- `parseEnumParam<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T`
- `statementHref(studentId: string, rosterQuery: string): string` → `/reports/students/<id>` + `?<query>` when non-empty.
- `rosterHref(statementQuery: string): string` → `/reports/students` + `?<query>` when non-empty.

- [ ] Write tests: mergeQuery keeps `year`/`semester`, drops defaults and empties, overwrites changed keys; parseDateParam accepts `2026-09-01`, rejects `2026-13-40`, `2026-02-30`, `abc`, `null`; parseEnumParam fallback; statementHref/rosterHref with and without query.
- [ ] Run `npx vitest run src/lib/reports/url-filters.test.ts` → FAIL (module missing).
- [ ] Implement.
- [ ] Run → PASS. Commit `feat(reports): url filter helpers`.

### Task 2: Sidebar opens the active group

**Files:** Modify `src/components/app-sidebar.tsx` (`NavDropdown`).

- [ ] Track previous `active` in state; during render, when `active` turns true set `open` true (React's "adjust state when a prop changes" pattern, no effect).
- [ ] `tsc` + eslint on the file clean. Commit `fix(sidebar): open the group of the page you are on`.

### Task 3: Filters in the URL (daily, discounts, collections, roster) + statement navigation

**Files:** Create `src/hooks/use-url-filters.ts`; modify `daily-revenue-panel.tsx`, `discount-report-panel.tsx`, `collections-report-panel.tsx`, `student-roster-panel.tsx`, `student-statement-panel.tsx`.

**Consumes:** Task 1.
**Produces:** `useUrlFilters(): (next: Record<string, string | undefined>, defaults: Record<string, string>, opts?: { replace?: boolean }) => void`

- [ ] Hook: reads `window.location.search` at call time, `mergeQuery`, then `router.push`/`router.replace` to `pathname?query` with `{ scroll: false }`.
- [ ] Daily/discount: `from`/`to` via `parseDateParam` (defaults first-of-month / today), daily `method` ∈ all|cash|transfer, `doc` ∈ summary|receipts|remittance|by-user.
- [ ] Collections: `level` ∈ all|grade|classroom, default `grade`.
- [ ] Roster: `grade`, `classroom`, `status` ∈ all|outstanding|unpaid|partial|paid, `q`. Search box keeps local text state, debounced 300 ms write with `replace`. Fetch with `fetchOutstandingReport` keyed on semester/year/grade/classroom/teacher only (all statuses), then `buildStudentRoster(rows, { status, query: q })` in render. `AppHeader` gets `clearGradeClassroomOnChange`. Name links use `statementHref(id, current query)`.
- [ ] Statement: `AppHeader basePath={/reports/students/<id>}`; a "← กลับไปรายชื่อ" link (`rosterHref(current query)`) left of the mode toggle, hidden in print.
- [ ] `npm test`, `tsc`, `npm run lint` (≤ 24). Commit `fix(reports): keep report filters in the URL; statement stays on the student`.

### Task 4: Browser check on `school`

- [ ] Reports dropdown open after `/reports` redirect; can still be collapsed.
- [ ] Daily: set dates + doc → other page → Back → same dates/doc; refresh keeps them.
- [ ] Roster: search 14297 → one history entry; open student → Back link → search kept; change semester on statement → still the same student.
- [ ] Collections level survives refresh. Leave semester on ภาค 1.

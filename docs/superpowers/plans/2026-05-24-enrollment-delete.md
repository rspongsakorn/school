# Enrollment Delete from Classroom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to hard-delete `student_enrollments` from the registration roster when no invoice exists for that semester.

**Architecture:** Pure eligibility helper; batch invoice check when loading roster; `deleteEnrollment` server action; delete button + confirm dialog in registration panel alongside existing move/status actions.

**Tech Stack:** Next.js App Router, Supabase, Vitest.

**React best practices (required before coding):** Read `vendor/react-best-practices/` per `.cursor/skills/react-best-practices/SKILL.md`.

**Spec:** [2026-05-24-enrollment-delete-design.md](../specs/2026-05-24-enrollment-delete-design.md)

---

### Task 1: Eligibility helper (TDD)

**Files:**
- Create: `src/lib/enrollment/enrollment-delete-eligibility.ts`
- Create: `src/lib/enrollment/enrollment-delete-eligibility.test.ts`

- [ ] Write failing tests: enrolled+no invoice, enrolled+invoice, withdrawn
- [ ] Implement `canDeleteEnrollment` + `enrollmentDeleteBlockedReason`
- [ ] Run: `npm test -- src/lib/enrollment/enrollment-delete-eligibility.test.ts`

---

### Task 2: Roster `deletable` flag

**Files:**
- Modify: `src/lib/data/enrollments.ts`

- [ ] Add `deletable` to `EnrollmentRosterRow`
- [ ] After roster load, query `student_invoices` for student_ids + semester_id from classroom
- [ ] Set `deletable = status enrolled && !hasInvoice`

---

### Task 3: `deleteEnrollment` action

**Files:**
- Modify: `src/lib/actions/enrollments.ts`

- [ ] Implement `deleteEnrollment(enrollmentId)` with checks from spec
- [ ] Revalidate `/registration`, `/students`, `/invoices`, `/reports/*`

---

### Task 4: Registration UI

**Files:**
- Modify: `src/components/registration/registration-panel.tsx`

- [ ] Trash button when `row.deletable`
- [ ] AlertDialog confirm + call `deleteEnrollment`
- [ ] Tooltip when not deletable (has invoice)
- [ ] Manual smoke per spec §6

---

### Task 5: Verify

- [ ] `npm test`
- [ ] `npm run build`

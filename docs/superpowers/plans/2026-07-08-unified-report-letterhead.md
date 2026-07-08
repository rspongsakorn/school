# Unified Report Letterhead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the shared `ReportLetterhead` component used by the 6 printable finance reports into a modern, minimal, brand-green letterhead sourced from `SCHOOL_CONFIG`, and consolidate the two duplicated logo files into one.

**Architecture:** `ReportLetterhead` is a pure presentational component rendered by 6 report panels (`print:block`, hidden on screen). It currently hardcodes school name/address and reads a separate logo file (`/school-logo.png`) from the one `SCHOOL_CONFIG.logoPath` (`/logo.png`) already used elsewhere (receipts). We repoint `ReportLetterhead` and the login page at `SCHOOL_CONFIG`, restyle the markup per the approved design ("Style B"), then delete the now-unused `public/school-logo.png`.

**Tech Stack:** Next.js (App Router), React, Tailwind CSS, `next/image`, Vitest (no meaningful unit tests here — this is presentational markup/CSS; verification is visual via the print preview and a full build/lint pass).

---

### Task 1: Redesign `ReportLetterhead` and source data from `SCHOOL_CONFIG`

**Files:**
- Modify: `src/components/finance/report-letterhead.tsx`

- [ ] **Step 1: Read the current component for reference**

Current content of `src/components/finance/report-letterhead.tsx`:

```tsx
import Image from "next/image";
import { formatThaiDateLong } from "@/lib/format";

type ReportLetterheadProps = {
  title: string;
  yearName?: string;
  semesterNumber?: number;
  subtitle?: string;
};

export function ReportLetterhead({
  title,
  yearName,
  semesterNumber,
  subtitle,
}: ReportLetterheadProps) {
  return (
    <div className="report-letterhead hidden mb-4 border-b border-black pb-3 print:block">
      <div className="flex items-center gap-3">
        <Image src="/school-logo.png" alt="โลโก้โรงเรียน" width={56} height={56} className="rounded-full" />
        <div>
          <p className="text-lg font-bold">โรงเรียนบัวใหญ่วิทยา</p>
          <p className="text-sm">อ.บัวใหญ่ จ.นครราชสีมา</p>
        </div>
      </div>
      <div className="mt-2">
        <p className="text-base font-semibold">{title}</p>
        {yearName ? (
          <p className="text-sm">
            ภาคเรียนที่ {semesterNumber ?? 1} · ปีการศึกษา {yearName}
          </p>
        ) : null}
        {subtitle ? <p className="text-sm">{subtitle}</p> : null}
        <p className="text-xs text-gray-600">พิมพ์เมื่อ {formatThaiDateLong(new Date())}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the component body with the redesigned "Style B" letterhead**

Write the full new content of `src/components/finance/report-letterhead.tsx`:

```tsx
import Image from "next/image";
import { formatThaiDateLong } from "@/lib/format";
import { SCHOOL_CONFIG } from "@/lib/school-config";

type ReportLetterheadProps = {
  title: string;
  yearName?: string;
  semesterNumber?: number;
  subtitle?: string;
};

export function ReportLetterhead({
  title,
  yearName,
  semesterNumber,
  subtitle,
}: ReportLetterheadProps) {
  return (
    <div className="report-letterhead hidden mb-4 pb-3 print:block">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image
            src={SCHOOL_CONFIG.logoPath}
            alt="โลโก้โรงเรียน"
            width={44}
            height={44}
            className="rounded-full border border-gray-300 object-cover"
          />
          <div>
            <p className="text-sm font-semibold">{SCHOOL_CONFIG.name}</p>
            <p className="text-[10px] text-gray-500">
              {SCHOOL_CONFIG.address} · {SCHOOL_CONFIG.phone}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-[#1f7a52]">{title}</p>
          {yearName ? (
            <p className="text-[10px] text-gray-400">
              ภาคเรียนที่ {semesterNumber ?? 1} / {yearName}
            </p>
          ) : null}
          {subtitle ? <p className="text-[10px] text-gray-400">{subtitle}</p> : null}
        </div>
      </div>
      <div
        className="mt-3 h-0.5 rounded-full"
        style={{ background: "linear-gradient(90deg, #1f7a52, #34aa79)" }}
      />
      <p className="mt-1 text-[10px] text-gray-500">พิมพ์เมื่อ {formatThaiDateLong(new Date())}</p>
    </div>
  );
}
```

- [ ] **Step 3: Run the linter and type check**

Run: `npm run lint`
Expected: no errors related to `report-letterhead.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/report-letterhead.tsx
git commit -m "feat(reports): redesign shared print letterhead in brand green"
```

---

### Task 2: Point the login page logo at `SCHOOL_CONFIG`

**Files:**
- Modify: `src/app/login/page.tsx:16-23`

- [ ] **Step 1: Add the `SCHOOL_CONFIG` import**

In `src/app/login/page.tsx`, change:

```tsx
import Image from "next/image";
import { LoginForm } from "@/components/auth/login-form";
```

to:

```tsx
import Image from "next/image";
import { LoginForm } from "@/components/auth/login-form";
import { SCHOOL_CONFIG } from "@/lib/school-config";
```

- [ ] **Step 2: Replace the hardcoded logo path**

Change:

```tsx
          <Image
            src="/school-logo.png"
            alt="โลโก้โรงเรียนบัวใหญ่วิทยา"
            width={80}
            height={80}
            className="rounded-full object-cover"
            priority
          />
```

to:

```tsx
          <Image
            src={SCHOOL_CONFIG.logoPath}
            alt={`โลโก้${SCHOOL_CONFIG.name}`}
            width={80}
            height={80}
            className="rounded-full object-cover"
            priority
          />
```

- [ ] **Step 3: Run the linter and type check**

Run: `npm run lint`
Expected: no errors related to `login/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "fix(login): use SCHOOL_CONFIG logo path instead of hardcoded file"
```

---

### Task 3: Remove the duplicated logo file

**Files:**
- Delete: `public/school-logo.png`

- [ ] **Step 1: Confirm no remaining references to the file**

Run: `grep -rn "school-logo" src public --include="*.ts" --include="*.tsx" --include="*.css"`
Expected: no output (empty). If any file still references `school-logo.png`, stop and update that file to use `SCHOOL_CONFIG.logoPath` before continuing — do not delete the file until this is empty.

- [ ] **Step 2: Delete the file**

```bash
git rm public/school-logo.png
```

- [ ] **Step 3: Run the full build to confirm nothing 404s at build time**

Run: `npm run build`
Expected: build succeeds with no errors referencing `school-logo.png`.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove duplicated school-logo.png, use logo.png everywhere"
```

---

### Task 4: Visual verification in the browser

**Files:** none (manual verification only)

- [ ] **Step 1: Start the dev server**

Use the preview tooling to start the Next.js dev server (`npm run dev`).

- [ ] **Step 2: Log in and confirm the login page logo renders**

Navigate to `/login`. Confirm the school logo image renders (no broken image icon) and looks the same as before (circular, 80×80).

- [ ] **Step 3: Open a finance report and trigger print preview**

Navigate to any of the 6 finance report panels (e.g. outstanding report), open the browser print preview (`window.print()` via the existing "พิมพ์" button, or the browser's own print-preview shortcut).

Confirm:
- Logo renders (no broken image icon), circular with a thin border.
- School name (semibold) and address/phone (small gray) appear on the left.
- Report title appears bold in green (`#1f7a52`) on the right, with semester/year below it in gray.
- A thin green gradient rule renders under the header row.
- The "พิมพ์เมื่อ ..." timestamp still renders below the rule.

- [ ] **Step 4: Spot-check a second report panel**

Repeat step 3 for one more report panel (e.g. daily revenue) to confirm the shared component renders consistently across reports.

- [ ] **Step 5: Confirm the A5 receipt is unaffected**

Open any receipt print page (`/receipts/[paymentId]`). Confirm its layout/logo is unchanged from before this work (still resolves via `SCHOOL_CONFIG.logoPath`, which was already correct).

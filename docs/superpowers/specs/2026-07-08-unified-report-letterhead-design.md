# Unified Report Letterhead Design

## Problem

The 6 printable finance report panels (outstanding, discount, student roster,
student statement, collections, daily revenue) share `ReportLetterhead`, but
its design is dated and it duplicates school name/address as literal strings
instead of using `SCHOOL_CONFIG`. It also reads its logo from
`public/school-logo.png`, a separate file duplicating `public/logo.png`
(the file `SCHOOL_CONFIG.logoPath` already points to).

The A5 receipt (`src/app/receipts/[paymentId]/page.tsx`) is a visually
separate, self-contained print layout (different paper size, own inline
styling) and is out of scope for the redesign itself — it already uses
`SCHOOL_CONFIG.logoPath` correctly.

## Goals

- Give the 6 finance reports a consistent, modern, minimal letterhead in the
  school's actual brand color.
- Remove the duplicated logo file and duplicated school info strings.
- No other behavior changes (no footer, no page numbers, no changes to
  report bodies, toolbar, or the receipt page layout).

## Design

### Letterhead layout ("Style B — modern, colored")

Single-row header, left/right split, with a colored rule beneath:

```
[○ logo]  โรงเรียนบัวใหญ่วิทยา                    รายงานยอดค้างชำระ
          168 ถนนนิเวศรัตน์ ...044-461-614          ภาคเรียนที่ 1 / 2569
──────────────────────────────────────────────────── (gradient rule)
```

- **Left group:** circular logo image (44×44, 1px `#d1d5db` border) next to
  a two-line block: school name (14px, semibold) above address+phone
  (10px, `#6b7280`).
- **Right group:** report title (14px, bold, `#1f7a52`) above semester/year
  (10px, `#9ca3af`), right-aligned.
- **Rule:** 2px horizontal bar directly under the header row, linear
  gradient `#1f7a52 → #34aa79` (matches the app's existing `--primary`
  brand green), full width, `border-radius: 2px`.
- The existing "printed on <date>" line stays where it already renders
  today (no repositioning beyond the title/semester swap described above).
- No footer, no page numbers — this stays out of scope per explicit
  confirmation.

This replaces whatever the current `ReportLetterhead` markup/styling is;
the component's props/usage contract (what data it's given by the 6 report
panels) does not change.

### Data source consolidation

- `ReportLetterhead` reads logo path, school name, address, and phone from
  `SCHOOL_CONFIG` (`src/lib/school-config.ts`) instead of hardcoded
  literals.
- Delete `public/school-logo.png`. Only `public/logo.png` remains, referenced
  via `SCHOOL_CONFIG.logoPath`.
- `src/app/login/page.tsx` also hardcodes `/school-logo.png` (line 17) — this
  is an existing consumer not previously documented. Update it to use
  `SCHOOL_CONFIG.logoPath` too, so the file can be safely deleted.

### Out of scope

- The A5 receipt page's layout/styling is unchanged. It already resolves
  its logo via `SCHOOL_CONFIG.logoPath`, so no code change is needed there
  beyond confirming no lingering reference to `school-logo.png` exists
  anywhere in the codebase.
- No new reports are added to the printable set; scope is exactly the 6
  existing finance report panels.

## Files touched

- `src/components/finance/report-letterhead.tsx` — redesign markup/styles,
  switch to `SCHOOL_CONFIG` for logo/name/address/phone.
- `src/app/login/page.tsx` — swap hardcoded `/school-logo.png` for
  `SCHOOL_CONFIG.logoPath`.
- `public/school-logo.png` — deleted (only after confirming no remaining
  references).

## Testing

- Visually verify all 6 report panels in print preview
  (`window.print()` / browser print dialog) show the new letterhead
  correctly, including logo rendering (no 404) and colors.
- Confirm removing `school-logo.png` doesn't break anything (grep first).
- No changes needed to the receipt page or its tests.

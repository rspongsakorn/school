# Student CSV Import Dialog Phases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `StudentImportDialog` into `setup` and `review` phases so format/sample/file controls hide after CSV selection, with a **ยกเลิก** button that resets to setup without closing the dialog.

**Architecture:** Single `phase: 'setup' | 'review'` state in the client component. Enter `review` at the start of `handleFileChange`. `handleCancel` clears parse state and returns to `setup`. Existing `useEffect` on `open === false` resets everything when the dialog closes. No server changes.

**Tech Stack:** Next.js App Router, React client component, existing shadcn Dialog/Table/Button.

**React best practices (required before coding):** Read `vendor/react-best-practices/` per `.cursor/skills/react-best-practices/SKILL.md`.

**Spec:** [docs/superpowers/specs/2026-05-24-student-csv-import-dialog-phases-design.md](../specs/2026-05-24-student-csv-import-dialog-phases-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/components/students/student-import-dialog.tsx` | Phase state, conditional UI, cancel handler |
| `docs/superpowers/specs/2026-05-24-student-csv-import-design.md` | Update §4 UI to match setup/review + full preview |

No new files. No automated component tests in repo — verify via manual checklist + `npm run build`.

---

### Task 1: Phase state and handlers

**Files:**
- Modify: `src/components/students/student-import-dialog.tsx`

- [ ] **Step 1: Add phase type and state**

After `type ParsedState`, add:

```ts
type ImportPhase = "setup" | "review";
```

Inside `StudentImportDialog`, add state (default `setup`):

```ts
const [phase, setPhase] = useState<ImportPhase>("setup");
```

- [ ] **Step 2: Reset phase when dialog closes**

In the existing `useEffect` that runs when `open` is false, add:

```ts
setPhase("setup");
```

Full reset block:

```ts
useEffect(() => {
  if (open) return;
  setPhase("setup");
  setParsing(false);
  setImporting(false);
  setParseError(null);
  setParsed(null);
  if (fileInputRef.current) fileInputRef.current.value = "";
}, [open]);
```

- [ ] **Step 3: Enter review on file select**

At the top of `handleFileChange`, after confirming `file` exists:

```ts
setPhase("review");
setParsing(true);
setParseError(null);
setParsed(null);
```

Remove the duplicate `setParsing(true)` / `setParseError` / `setParsed` lines that follow if they become redundant.

- [ ] **Step 4: Add `handleCancel`**

```ts
function handleCancel() {
  setPhase("setup");
  setParsing(false);
  setParseError(null);
  setParsed(null);
  if (fileInputRef.current) fileInputRef.current.value = "";
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/students/student-import-dialog.tsx
git commit -m "feat: add setup/review phase state to student CSV import dialog"
```

---

### Task 2: Conditional UI and footer

**Files:**
- Modify: `src/components/students/student-import-dialog.tsx`

Read `vendor/react-best-practices/SKILL.md` + `AGENTS.md` before editing JSX.

- [ ] **Step 1: Phase-aware description**

Replace static `DialogDescription` with:

```tsx
<DialogDescription>
  {phase === "setup"
    ? "อัปโหลดไฟล์ตามรูปแบบด้านล่าง ระบบจะตรวจสอบก่อนนำเข้า"
    : "ตรวจสอบรายการก่อนยืนยันนำเข้า"}
</DialogDescription>
```

- [ ] **Step 2: Wrap setup content**

Wrap lines ~170–210 (format table + download + file input buttons) in:

```tsx
{phase === "setup" ? (
  <>
    <div className="overflow-x-auto rounded-md border">
      {/* existing CSV_FORMAT_TABLE Table */}
    </div>
    <div className="flex flex-wrap gap-2">
      {/* download + select file buttons */}
      <input ref={fileInputRef} ... />
    </div>
  </>
) : null}
```

Keep `<input type="file">` inside setup block only (still works when user returns via cancel).

- [ ] **Step 3: Wrap review content**

Replace `{parseError ? ...}` and `{parsed ? ...}` blocks with review-only section:

```tsx
{phase === "review" ? (
  <div className="space-y-4">
    {parsing ? (
      <p className="text-sm text-muted-foreground">กำลังตรวจสอบ...</p>
    ) : null}

    {parseError ? <p className="text-sm text-destructive">{parseError}</p> : null}

    {parsed ? (
      <div className="space-y-4">
        {/* existing stats, errors table, preview table — unchanged */}
      </div>
    ) : null}
  </div>
) : null}
```

Remove "กำลังตรวจสอบ..." from the setup **เลือกไฟล์ CSV** button label (setup button only shows when not parsing).

Setup select button:

```tsx
<Button
  type="button"
  variant="outline"
  disabled={importing}
  onClick={() => fileInputRef.current?.click()}
>
  เลือกไฟล์ CSV
</Button>
```

- [ ] **Step 4: Phase-aware footer**

Replace `DialogFooter` with:

```tsx
<DialogFooter>
  {phase === "review" ? (
    <Button
      type="button"
      variant="outline"
      disabled={importing}
      onClick={handleCancel}
    >
      ยกเลิก
    </Button>
  ) : null}
  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
    ปิด
  </Button>
  {phase === "review" ? (
    <Button type="button" disabled={!canConfirm} onClick={handleConfirm}>
      {importing ? "กำลังนำเข้า..." : "ยืนยันนำเข้า"}
    </Button>
  ) : null}
</DialogFooter>
```

- [ ] **Step 5: Run build**

```bash
npm run build
```

Expected: TypeScript passes, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/students/student-import-dialog.tsx
git commit -m "feat: setup/review UI and cancel for student CSV import dialog"
```

---

### Task 3: Update parent spec §4

**Files:**
- Modify: `docs/superpowers/specs/2026-05-24-student-csv-import-design.md`

- [ ] **Step 1: Replace §4 UI section**

Update **§4. UI — `StudentImportDialog`** to document:

- **Phase `setup`:** format table, download sample, select file; footer = **ปิด** only
- **Phase `review`:** after file selected — summary, errors table, full import preview (all rows, includes `id_card`); footer = **ยกเลิก** | **ปิด** | **ยืนยันนำเข้า**
- **ยกเลิก:** returns to `setup` without closing dialog
- Link to [2026-05-24-student-csv-import-dialog-phases-design.md](./2026-05-24-student-csv-import-dialog-phases-design.md)

Remove outdated text: format table always visible; preview max 10 rows.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-24-student-csv-import-design.md
git commit -m "docs: align student CSV import spec with setup/review dialog phases"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Manual checklist** (from spec §6)

1. Open dialog → format table + download + select file; footer **ปิด** only  
2. Select valid CSV → setup hidden; footer **ยกเลิก** | **ปิด** | **ยืนยัน**; preview visible  
3. Click **ยกเลิก** → back to setup; dialog still open  
4. Select invalid CSV → stay in review with error; cancel → can pick new file  
5. Click **ปิด** from review → dialog closes; reopen starts at setup  

- [ ] **Step 2: Run tests (regression)**

```bash
npm test
```

Expected: all existing tests pass (no new tests required for this UI-only change).

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| `setup` shows format + download + select | Task 2 |
| `review` hides setup controls | Task 2 |
| Cancel only in review | Task 2 |
| Cancel resets to setup, dialog stays open | Task 1 |
| Close resets on dialog close | Task 1 |
| Parsing message in review | Task 2 |
| Review description text | Task 2 |
| No server changes | — |
| Parent spec update | Task 3 |
| Manual tests | Task 4 |

# Full-Width Payments History Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "รายการการชำระ" history card out of the right column in `payments-panel.tsx` so it spans the full page width below the search + record-payment top row.

**Architecture:** Pure JSX container restructure in one file. The outer `grid lg:grid-cols-[320px_1fr]` becomes a vertical `space-y-6` stack. A new inner grid wraps only the two top cards (ค้นหานักเรียน + รับชำระเงิน). The history card moves to a full-width row below that grid. No logic, data, query, or component changes.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS.

---

### Task 1: Restructure the layout containers

**Files:**
- Modify: `src/components/finance/payments-panel.tsx`

The current structure (return block starting at line 362):

```
<div grid lg:grid-cols-[320px_1fr]>        (A, opens ~366)
  <Card>ค้นหานักเรียน</Card>
  <div space-y-6>                           (B, opens ~470)
    <Card>รับชำระเงิน</Card>
    <Card>รายการการชำระ</Card>
  </div>                                     (B closes ~816)
  <AlertDialog confirm />
  <AlertDialog void />
</div>                                       (A closes ~880)
```

Target structure:

```
<div space-y-6>                             (A, now a vertical stack)
  <div grid lg:grid-cols-[300px_1fr]>       (C, new — wraps top two cards)
    <Card>ค้นหานักเรียน</Card>
    <Card>รับชำระเงิน</Card>
  </div>                                     (C closes)
  <Card>รายการการชำระ</Card>                 (full width)
  <AlertDialog confirm />
  <AlertDialog void />
</div>                                       (A closes)
```

Four edits accomplish this: change A's class + open grid C (Edit 1), remove wrapper B's open tag (Edit 2), close grid C between the two top sections (Edit 3), remove wrapper B's close tag (Edit 4).

- [ ] **Step 1: Edit 1 — change outer container to a stack and open the top grid**

Replace:

```tsx
        <div
          className={cn(
            "grid gap-6 transition-opacity lg:grid-cols-[320px_1fr]",
            (isNavigating || isLoading) && "pointer-events-none opacity-60",
          )}
        >
          <Card className="border-border shadow-sm">
```

with:

```tsx
        <div
          className={cn(
            "space-y-6 transition-opacity",
            (isNavigating || isLoading) && "pointer-events-none opacity-60",
          )}
        >
          <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <Card className="border-border shadow-sm">
```

- [ ] **Step 2: Edit 2 — remove the right-column wrapper open tag**

The "ค้นหานักเรียน" card closes, then the old `<div className="space-y-6">` wrapper opened. Remove that wrapper so the "รับชำระเงิน" card becomes the second cell of the top grid.

Replace:

```tsx
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">รับชำระเงิน</CardTitle>
```

with:

```tsx
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">รับชำระเงิน</CardTitle>
```

- [ ] **Step 3: Edit 3 — close the top grid between รับชำระ and the history card**

The "รับชำระเงิน" card closes, then the "รายการการชำระ" card begins. Insert `</div>` to close the top grid (C) so the history card drops below it at full width.

Replace:

```tsx
                </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-col gap-3">
```

with:

```tsx
                </CardContent>
            </Card>
          </div>

          <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-col gap-3">
```

- [ ] **Step 4: Edit 4 — remove the old right-column wrapper close tag**

The "รายการการชำระ" card closes; the old `</div>` (line 816) closed wrapper B, which no longer exists. Remove it.

Replace:

```tsx
                </div>
              </CardContent>
            </Card>
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
```

with:

```tsx
                </div>
              </CardContent>
            </Card>

          <AlertDialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
```

- [ ] **Step 5: Verify JSX compiles (div balance correct)**

Run: `npx tsc --noEmit`
Expected: no output (exit 0). A mismatched tag from the restructure surfaces here as a JSX error.

- [ ] **Step 6: Visual check in dev server**

Run the app (`npm run dev`) and open `/payments`. Confirm:
- Top row: "ค้นหานักเรียน" (left) and "รับชำระเงิน" (right) side by side, unchanged.
- Below: "รายการการชำระ" table spans the full page width; its 9 columns are no longer cramped.
- Filters (search box, ชั้น, ห้อง) sit in the history card header; void/receipt actions still work.
- Mobile (narrow viewport): cards stack vertically as before.

- [ ] **Step 7: Commit**

```bash
git add src/components/finance/payments-panel.tsx
git commit -m "feat: make payments history table full width"
```

---

## Self-Review

**Spec coverage:**
- "Top row — existing two-column grid (search + record), unchanged" → Edits 1–3 keep both cards in a `lg:grid-cols-[300px_1fr]` grid. ✓
- "Bottom row — history card spans full page width" → Edits 3–4 move it below the grid as a direct child of the `space-y-6` stack. ✓
- "Nothing inside the history card changes" → no edits touch history card internals. ✓
- "Purely a JSX restructure, no logic/data/components" → only container tags changed. ✓

**Placeholder scan:** No TBD/TODO/vague steps; every code step shows exact before/after. ✓

**Type consistency:** No types, signatures, or names introduced — layout-only. The `cn` helper and `isNavigating`/`isLoading` references in Edit 1 are preserved verbatim. ✓

**Note on grid width:** spec's target structure specifies `lg:grid-cols-[300px_1fr]` (down from the original `320px`), matching the approved mockup. Edit 1 applies this.

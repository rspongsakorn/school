# Invoice Row Actions: Inline Icon Buttons

**Date:** 2026-06-06
**Status:** Approved

## Problem

The `...` dropdown menu on each invoice row has two UX issues:
1. Requires 2 clicks to reach any action (discoverability)
2. Users don't know actions exist until they click `...`

## Solution

Replace the `DropdownMenu` with inline `size="icon-sm" variant="ghost"` icon buttons shown directly in the row. Icons are always visible, one click to action.

## Actions & Icons

| Action | Icon (lucide) | Condition | Style |
|---|---|---|---|
| ดูการชำระ | `CreditCard` | paidAmount > 0 | default |
| เบิกได้/ไม่ได้ | `BadgeCheck` / `Badge` | paidAmount === 0 | sky when active |
| ส่วนลด | `Percent` | paidAmount === 0 | default |
| ลบ | `Trash2` | deletable | destructive |
| ลบไม่ได้ | `Trash2` | blockedReason exists | opacity-40, cursor-not-allowed, title={blockedReason} |

## Layout

```
[...row cells...] | [icon] [icon] [icon]   ← flex gap-1 justify-end
```

Column width stays the same (`size="icon-sm"` = 28px each, max 3 buttons = ~100px).

## Files Changed

- `src/components/finance/invoices-panel.tsx` — replace DropdownMenu with icon buttons, remove unused imports

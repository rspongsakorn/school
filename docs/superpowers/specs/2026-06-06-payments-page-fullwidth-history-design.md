# Payments Page: Full-Width History Table

**Date:** 2026-06-06
**Status:** Approved

## Problem

The `/payments` page uses a `lg:grid-cols-[320px_1fr]` two-column layout. The
payment history table ("รายการการชำระ") sits inside the right `1fr` column,
stacked below the record-payment form. This squeezes the table into a narrow
column even though it has 9 columns of data — it feels cramped.

The user diagnosed the real pain as **the history table being squeezed**, not
the overall workflow. Earlier exploration of full-width-table redesigns (moving
record-payment into a dialog) was rejected because it would demote the primary
cashier action (recording payment) behind extra clicks.

## Solution

Keep the cashier workflow untouched. Restructure the page into two stacked rows:

1. **Top row** — the existing two-column grid: "ค้นหานักเรียน" card (left,
   ~300px) + "รับชำระเงิน" card (right). Unchanged.
2. **Bottom row** — the "รายการการชำระ" history card, pulled out of the right
   column to span the **full page width**. Its filters (search box, grade,
   classroom) sit in the card header; the 9-column table fills the width below.

## Layout Change

Current structure (simplified):

```
<div class="grid lg:grid-cols-[320px_1fr]">
  <Card>ค้นหานักเรียน</Card>
  <div>                          ← right 1fr column
    <Card>รับชำระเงิน</Card>
    <Card>รายการการชำระ</Card>   ← cramped here
  </div>
</div>
```

New structure:

```
<div class="space-y-6">
  <div class="grid lg:grid-cols-[300px_1fr]">
    <Card>ค้นหานักเรียน</Card>
    <Card>รับชำระเงิน</Card>
  </div>
  <Card>รายการการชำระ</Card>      ← full width
</div>
```

The history `Card` moves out of the right-column wrapper to become a sibling of
the top grid. Nothing inside the history card changes — same filters, same
mobile-stacked-cards + desktop-table markup, same void/receipt actions.

## What Does NOT Change

- Student search, outstanding display, amount/method form, confirm dialog,
  receipt printing — all unchanged.
- The history table's columns, filters, search, void flow, mobile cards.
- Data fetching, query keys, server actions.

This is purely a JSX restructure of the outer layout containers in
`payments-panel.tsx`. No logic, no data, no new components.

## Files

| File | Change |
|---|---|
| `src/components/finance/payments-panel.tsx` | Move history `Card` out of the right column to a full-width row below the top grid |

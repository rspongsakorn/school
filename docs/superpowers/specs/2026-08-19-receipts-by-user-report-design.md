# Receipts-by-user report

## Purpose

Finance staff can currently see, per receipt, who recorded it (`ทำรายการโดย` column
in the existing "รายงานการออกใบเสร็จ" view). There is no way to see totals *per
user* for a date range — e.g. "how many receipts and how much money did each
cashier process this week." This adds that summary view.

## Placement

Add a fourth option to the existing document-type selector in
`DailyRevenuePanel` (`src/components/finance/daily-revenue-panel.tsx`), next to
"สรุปรายวัน", "รายงานการออกใบเสร็จ", "ใบนำส่งเงินประจำวัน":

- `"by-user"` → "สรุปยอดตามผู้ใช้งาน"

It reuses the same date-range and payment-method filters already on the page.
No new route or page.

## Data layer

`fetchDailyRevenue` in `src/lib/queries/reports.ts` already fetches every
payment row in range joined with `profiles!payments_recorded_by_fkey
(display_name)`. Reuse that same fetch instead of issuing a second query:

- New pure function `groupRevenueByUser` in `src/lib/reports/by-user.ts`
  (mirrors `groupDailyRevenue` in `src/lib/reports/daily.ts`), taking the same
  shape of payment rows plus `profileId`/`recordedByName`, grouping by
  `profileId` instead of by date:

  ```ts
  export type UserRevenueRow = {
    profileId: string;
    recordedByName: string;
    receiptCount: number;
    cashTotal: number;
    transferTotal: number;
    total: number;
    voidedCount: number;
    voidedAmount: number;
  };
  ```

  Sorted by `total` descending. A payment with no `recorded_by` match (should
  not happen given the FK, but mirrors the `"—"` fallback already used for
  `recordedByName` elsewhere) groups under a synthetic `profileId: "unknown"`
  row labeled "—".

- Extend `DailyRevenueResult` (in `reports.ts`) with a second grouping,
  computed alongside `summary`/`receiptsByDate` from the same `rows` array
  already in hand:

  ```ts
  export type DailyRevenueResult = {
    summary: DailyRevenueRow[];
    receiptsByDate: Record<string, DailyDetailReceipt[]>;
    byUser: UserRevenueRow[];
    receiptsByUser: Record<string, DailyDetailReceipt[]>; // keyed by profileId
  };
  ```

  `receiptsByUser` reuses the existing `DailyDetailReceipt` type, just keyed by
  `profileId` (falling back to `"unknown"`) instead of by date key.

No new Supabase query, no new indexes — this is a client-side regrouping of
data the page already loads.

## UI

New component `src/components/finance/receipts-by-user-panel.tsx`, styled like
the existing daily-summary table in `daily-revenue-panel.tsx` (not like
`ReceiptIssuanceView`, which is a flat print-oriented list):

- Columns: ผู้ใช้งาน, จำนวนใบเสร็จ, เงินสด, เงินโอน, รวม — with a "ยกเลิก N"
  badge next to the name when `voidedCount > 0`, matching the daily table's
  pattern.
- Footer row: "รวมทั้งช่วง" totals.
- Clicking a row toggles an inline expansion (same `openX === row.key ? ... :
  null` pattern as `openDate` in `daily-revenue-panel.tsx`) showing that user's
  receipts: time, receipt number, student name/code, method, amount, status
  badge if voided. Reuses the same row shape already rendered for the expanded
  date rows today.

`DailyRevenuePanel` gets a new `openUser` state (parallel to `openDate`,
independent — only one docType is visible at a time so no conflict) and passes
`byUser` / `receiptsByUser` into the new panel when `docType === "by-user"`.

## Out of scope

- No new filter to view a single user's receipts inline in the *existing*
  "สรุปรายวัน" or "รายงานการออกใบเสร็จ" views — this is a separate summary
  view only, per user preference during design.
- No changes to how `recorded_by` is captured on payments — that already
  exists.

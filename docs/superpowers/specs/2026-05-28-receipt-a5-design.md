# Receipt A5 Print Page — Design Spec

## Goal

Replace the existing receipt dialog + `window.print()` approach with a dedicated A5 print page at `/receipts/[paymentId]` that shows full school branding, individual fee line items, academic year, semester, and all required payment details.

## Architecture

A standalone Next.js Server Component route outside the dashboard layout. Fetches all data fresh from Supabase at request time (no reliance on snapshot for new fields). Renders a print-ready A5 HTML page with `@media print` CSS that hides the on-screen controls.

## Layout (Classic — approved)

```
┌─────────────────────────────────────────────┐
│  [Logo]  โรงเรียนบัวใหญ่วิทยา              │
│          168 ถ.นิเวศรัตน์ ...              │
│          โทร. 044-461-614                   │
│═════════════════════════════════════════════│
│              ใบเสร็จรับเงิน               │
│─────────────────────────────────────────────│
│  ชื่อ-สกุล: ...    │  เลขที่: ...          │
│  รหัส: ...          │  วันที่: ...          │
│  ชั้น/ห้อง: ...     │  วิธีชำระ: ...       │
│  ปีการศึกษา: ...                            │
│  ภาคเรียนที่: ...                           │
│─────────────────────────────────────────────│
│  รายการค่าใช้จ่าย        จำนวนเงิน (บาท)  │
│  ค่าธรรมเนียมการศึกษา         5,000.00     │
│  ค่าอาหารกลางวัน              1,500.00     │
│  ...                                        │
│  รวมทั้งสิ้น                  7,000.00 บาท│
│─────────────────────────────────────────────│
│           [เลขอ้างอิงโอน — ถ้าโอน]         │
│                        ผู้รับเงิน: _______ │
│  [ปุ่มพิมพ์ — ซ่อนตอนพิมพ์]               │
└─────────────────────────────────────────────┘
```

## Data Flow

```
payments (id, receipt_number, amount, payment_method,
          transfer_reference, paid_at, academic_year_id)
  ↓ join academic_years → name (ปีการศึกษา)
  ↓ join receipts → snapshot_data (student info, recordedBy)
  ↓ join payment_allocations → invoice_id
      ↓ join student_invoices → semester_id
          ↓ join semesters → number (ภาคเรียน)
      ↓ join invoice_lines → fee_item_id, amount
          ↓ join fee_items → name
```

**One DB call** using Supabase nested selects.

## Fields Displayed

| Field | Source |
|-------|--------|
| เลขที่ใบเสร็จ | `payments.receipt_number` |
| วันที่ชำระ | `payments.paid_at` (format Thai) |
| วิธีชำระ | `payments.payment_method` |
| เลขอ้างอิงโอน | `payments.transfer_reference` (show only if transfer) |
| ปีการศึกษา | `academic_years.name` |
| ภาคเรียนที่ | `semesters.number` (first semester_id found from allocations) |
| ชื่อ–สกุล | `receipts.snapshot_data.studentName` |
| รหัสนักเรียน | `receipts.snapshot_data.studentCode` |
| ชั้น/ห้อง | `receipts.snapshot_data.gradeClassroom` |
| ผู้รับเงิน | `receipts.snapshot_data.recordedBy` |
| รายการค่าใช้จ่าย | `invoice_lines.amount` + `fee_items.name` (all lines across all paid invoices) |
| ยอดรวม | `payments.amount` |

## Files

### Create: `src/lib/school-config.ts`

School constants — single place to edit when school info changes.

```ts
export const SCHOOL_CONFIG = {
  name: "โรงเรียนบัวใหญ่วิทยา",
  address: "168 ถนนนิเวศรัตน์ ตำบลบัวใหญ่ อำเภอบัวใหญ่ จังหวัดนครราชสีมา",
  phone: "044-461-614",
  logoPath: "/school-logo.png",
} as const;
```

Logo file: `public/school-logo.png` — must be placed manually. The page gracefully falls back to a green 🏫 emoji if the file is absent.

### Create: `src/lib/data/receipt-print.ts`

Single function `getReceiptPrintData(paymentId: string)` that returns:

```ts
export type ReceiptPrintData = {
  receiptNumber: string;
  paidAt: string;           // ISO string
  paymentMethod: "cash" | "transfer";
  transferReference: string | null;
  amount: number;
  academicYearName: string;  // e.g. "2568"
  semesterNumber: number;    // 1 or 2
  studentName: string;
  studentCode: string;
  gradeClassroom: string;
  recordedBy: string;
  lineItems: { name: string; amount: number }[];
};
```

Returns `null` if payment not found.

**Query strategy:**
1. Fetch `payments` row with joins:
   - `academic_years!payments_academic_year_id_fkey(name)`
   - `receipts(snapshot_data)`
   - `payment_allocations(amount, student_invoices(semester_id, semesters(number), invoice_lines(amount, fee_items(name))))`

2. Flatten `invoice_lines` from all allocations → `lineItems[]`
3. Pick `semesterNumber` from the first invoice found (all invoices in a payment share the same semester)

### Create: `src/app/receipts/[paymentId]/page.tsx`

**Server Component** — no `"use client"`.

- **Auth**: Call `createClient()` and check session. Redirect to `/login` if unauthenticated.
- **Data**: Call `getReceiptPrintData(params.paymentId)`. Return 404 if null.
- **Render**: Full HTML A5 receipt page using Tailwind classes + inline styles for print precision.
- **Print CSS**: Inline `<style>` block with:
  ```css
  @page { size: A5; margin: 10mm; }
  @media print { .no-print { display: none !important; } }
  ```
- **Structure**: Standalone page — does NOT use the dashboard `layout.tsx`. Imports `SCHOOL_CONFIG` and renders all fields.
- **Print button**: `<button onClick={() => window.print()}` with `className="no-print"`.

### Modify: `src/components/finance/payments-panel.tsx`

Two changes:

1. **After recording payment** — replace dialog open with new tab:
   ```ts
   // Before:
   setReceiptSnapshot(result.snapshot);
   setReceiptOpen(true);
   
   // After:
   window.open(`/receipts/${result.paymentId}`, "_blank");
   ```

2. **"พิมพ์ซ้ำ" button** — replace with link to print page:
   ```tsx
   // Before: <Button onClick={() => openReprint(p)}>พิมพ์ซ้ำ</Button>
   
   // After:
   <a href={`/receipts/${p.id}`} target="_blank" rel="noopener noreferrer">
     <Button type="button" size="sm" variant="outline">ใบเสร็จ</Button>
   </a>
   ```
   Apply to both the mobile card view and the desktop table row.

3. **Clean up**: Remove `receiptSnapshot`, `receiptOpen`, `openReprint`, and `<ReceiptDialog>` usage from the component since the dialog is no longer needed.

## Auth

The `/receipts/[paymentId]` route checks for a valid Supabase session. No role check needed beyond "logged in" (finance staff need to print; the payment already enforces finance role at creation time). If not authenticated, redirect to `/login?redirectTo=/receipts/<id>`.

## Print Sizing

```css
@page {
  size: A5;        /* 148mm × 210mm */
  margin: 10mm;
}
```

The receipt container is 128mm wide (148mm − 2×10mm margin). Use `width: 128mm` on the receipt body so it matches on screen too, centered with `margin: auto`.

## Error States

- Payment not found → `notFound()` (Next.js 404)
- Not authenticated → `redirect('/login')`
- Missing `school-logo.png` → `onerror` fallback to emoji

## Out of Scope

- PDF download (browser print-to-PDF covers this)
- Email sending
- Receipt voiding from this page
- Multi-payment batch printing

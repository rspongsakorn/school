# ลบ `invoice_name` แล้วใช้ชื่อจาก `receipt_type`

วันที่: 2026-06-11

## เป้าหมาย

คอลัมน์ "ใบแจ้ง" ในหน้าใบแจ้งชำระ ปัจจุบันแสดงค่าจาก `student_invoices.invoice_name`
(เช่น `ภาคเรียนที่ 1/2568`) ซึ่งซ้ำกันทุกใบและไม่ให้ข้อมูลที่มีประโยชน์ เปลี่ยนให้
แสดง **ชื่อประเภทใบเสร็จ** (`receipt_types.name`) แทน และลบคอลัมน์ `invoice_name`
ออกจากตาราง `student_invoices` เพราะไม่จำเป็นอีกต่อไป

ทุกใบแจ้งมี `receipt_type_id` อยู่แล้ว (migration `20260611000100`) จึงดึงชื่อจาก
ความสัมพันธ์นี้ได้โดยตรง

## ขอบเขต

แทนที่ `invoice_name` ด้วย `receipt_types.name` **ทุกที่** ที่เคยใช้ ไม่ใช่แค่
คอลัมน์ในหน้าใบแจ้ง

## การเปลี่ยนแปลง

### 1. Migration (`supabase/migrations/`)

ไฟล์ใหม่ `2026xxxxxxxxxx_drop_invoice_name.sql`:

- บังคับ `receipt_type_id` เป็น `NOT NULL` (ปัจจุบัน nullable แต่ backfill ครบแล้ว)
  เพื่อรับประกันว่าทุกใบแจ้งมีประเภทใบเสร็จเสมอ
- `ALTER TABLE public.student_invoices DROP COLUMN invoice_name;`

หมายเหตุ: ข้อมูลในคอลัมน์นี้จะหายถาวร แต่ snapshot ของใบเสร็จที่ออกไปแล้ว
เก็บค่าเดิมไว้ใน JSON (`receipts.snapshot_data`) จึงไม่กระทบใบเสร็จเก่า

### 2. Type (`src/lib/supabase/types.ts`)

ลบ field `invoice_name: string;` ออกจาก `student_invoices` TableDef

### 3. Queries / Data layer

ทุกจุดที่ `select` มี `invoice_name` เปลี่ยนเป็น join `receipt_types ( name )`
แล้ว map เป็น `invoiceName: row.receipt_types?.name ?? "—"` (ชื่อ field ที่ส่งออก
ยังคงเป็น `invoiceName` เหมือนเดิม เพื่อไม่ให้กระทบ consumer):

- `src/lib/queries/invoices.ts` — `fetchAllInvoices`, `fetchInvoicesPaginated`
- `src/lib/data/invoices.ts` — `listInvoicesPaginated`, `getStudentOutstandingInvoices`
- `src/lib/data/receipt-print.ts` — บรรทัดรวบยอดตอนชำระบางส่วน ใช้ชื่อประเภทใบเสร็จ
  แทน `inv.invoice_name`
- `src/lib/actions/payments.ts` — join receipt type ใน select ของ `recordPayment`
  แล้วใช้ค่าใน `allocationDetails` ที่เก็บลง snapshot

ในแต่ละไฟล์ต้องอัปเดต TypeScript `Row` type ภายใน: ลบ `invoice_name: string`
และเพิ่ม `receipt_types: { name: string } | null`

### 4. Action (`src/lib/actions/invoices.ts`)

`generateInvoices`:
- ลบ `invoice_name: invoiceName` ออกจาก object ที่ insert
- ลบตัวแปร `const invoiceName = ...` ที่ไม่ใช้แล้ว
- ลบ field `invoice_name: string` ออกจาก local type `InvoiceRow`

### 5. UI (`src/components/finance/invoices-panel.tsx`)

- เปลี่ยนหัวคอลัมน์จาก `ใบแจ้ง` เป็น `ประเภทใบแจ้ง`
- เซลล์ยังอ้าง `row.invoiceName` เหมือนเดิม (ค่าเปลี่ยนมาจาก receipt type)
- การ์ดแบบ mobile ก็ใช้ `row.invoiceName` เดิม ไม่ต้องแก้

Component อื่นที่ใช้ `invoiceName` (payments-panel, invoice-payment-dialog,
receipt-dialog) ไม่ต้องแก้ เพราะรับ field ชื่อเดิม

### 6. เปลี่ยนคำเรียกที่แสดงผล "ประเภทใบเสร็จ" → "ประเภทใบแจ้ง" ทั้งแอป

เปลี่ยนเฉพาะข้อความภาษาไทยที่แสดงต่อผู้ใช้ (วลี `ประเภทใบเสร็จ` → `ประเภทใบแจ้ง`)
โครงสร้างโค้ด/ชื่อตาราง/ตัวแปร (`receipt_type`, `receiptTypeId`, route `/receipt-types`)
ยังคงเดิม ไม่ต้องแตะ ไฟล์ที่ต้องแก้:

- `src/components/app-sidebar.tsx` — label เมนู
- `src/components/finance/receipt-types-panel.tsx` — page title, card title, dialog
  title, toast
- `src/components/finance/invoice-generate-dialog.tsx` — label + toast
- `src/lib/actions/receipt-types.ts` — error messages
- `src/lib/actions/fee-items.ts` — error message
- `src/lib/actions/invoices.ts` — error messages
- `src/lib/actions/payments.ts` — error messages

หมายเหตุ: แทนที่เฉพาะวลี `ประเภทใบเสร็จ` เท่านั้น คำว่า `ใบเสร็จ` เดี่ยวๆ
(ใบเสร็จจริงที่พิมพ์) ต้องคงไว้

## สิ่งที่ไม่กระทบ

- snapshot ใบเสร็จเก่า (เก็บค่าเดิมใน JSON)
- `src/lib/queries/reports.ts` (ไม่ได้ใช้ `invoice_name`)

## การทดสอบ / ตรวจสอบ

- `npx tsc --noEmit` ผ่าน (ยืนยันว่าไม่มีที่ไหนอ้าง `invoice_name` ค้าง)
- หน้าใบแจ้งชำระแสดงชื่อประเภทใบเสร็จในคอลัมน์ "ประเภทใบเสร็จ"
- การชำระเงิน + พิมพ์ใบเสร็จยังทำงานได้ (กรณีชำระเต็มและบางส่วน)

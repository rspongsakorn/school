# Design Spec: หน้าการเงินทั้งหมด (v1)

**Date:** 2026-05-24  
**Status:** Approved  
**Parent:** [2026-05-24-tuition-management-design.md](./2026-05-24-tuition-management-design.md)  
**Depends on:** [2026-05-24-academic-students-admin-design.md](./2026-05-24-academic-students-admin-design.md), [2026-05-24-registration-design.md](./2026-05-24-registration-design.md) (implemented)  
**Scope:** v1 finance module — ตั้งค่า, ใบแจ้งชำระ, บันทึกการจ่าย, รายงาน

---

## 1. Overview

แทนที่ placeholder การเงิน 3 หน้า (`/payments`, `/invoices`, `/reports`) และเพิ่มหน้าตั้งค่าที่จำเป็นก่อนออกใบและรับเงิน ตาม workflow ใน parent spec §4.1–4.4 และ §6

| กลุ่ม | หน้า | Route |
|------|------|-------|
| ตั้งค่า | ตั้งค่าค่าธรรมเนียม | `/fee-rates` |
| ตั้งค่า | ประเภทใบเสร็จ | `/receipt-types` |
| ปฏิบัติการ | ใบแจ้งชำระ | `/invoices` |
| ปฏิบัติการ | บันทึกการจ่าย | `/payments` |
| รายงาน | รายงานค้างชำระ | `/reports/outstanding` |
| รายงาน | สรุปการเก็บ | `/reports/collections` |

**Out of scope (v1):** PromptPay/QR, เช็ค, ใบทวกหนี้, ส่วนลดถาวรต่อนักเรียน, export Excel, พอร์ทัลผู้ปกครอง, route พิมพ์ใบเสร็จแยก (`/payments/[id]/receipt` — ใช้ modal แทน)

---

## 2. Decisions (brainstorming)

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| ขอบเขต | ครบ v1 การเงิน รวมตั้งค่า `fee_items`, `fee_rates`, `receipt_types` ก่อนใบแจ้งและรับเงิน |
| เมนูตั้งค่า | แยกหน้าใน sidebar กลุ่ม **การเงิน** (ไม่รวมแท็บเดียว) |
| รายงาน | แยก 2 เมนู / 2 routes |
| สร้างใบแจ้ง | สร้างทั้งภาค (enrolled ทุกคน) + โหมดเลือกชั้น/ห้อง/รายชื่อ |
| ใบเสร็จหลังจ่าย | Modal บนหน้า `/payments` + ปุ่มพิมพ์ (browser print) — ไม่ navigate |
| ลำดับ implement | แบ่ง 4 เฟส: ตั้งค่า → ใบแจ้ง → รับเงิน → รายงาน |
| Tech approach | Server Components + Server Actions + client islands (ตาม pattern ที่มี) |
| บริบทปี/ภาค | `?year=&semester=` + header selector (ยกเว้นหน้า master ที่ไม่ผูกภาค) |

---

## 3. Database Reference

Schema มีอยู่ใน `20260524120000_initial_schema.sql` — **ไม่ต้อง migration ใหม่** สำหรับ v1 นี้ (ยกเว้น seed เพิ่มเติมถ้าต้องการ)

### ตารางที่ใช้

| ตาราง | บทบาท |
|-------|--------|
| `fee_items` | รายการค่าใช้จ่าย (master) |
| `fee_rates` | อัตรา ต่อ `semester_id` + `grade_level_id` + `fee_item_id` |
| `receipt_types` | ประเภทใบเสร็จ |
| `student_invoices` | ใบแจ้งต่อนักเรียน/ปี/ภาค |
| `invoice_lines` | บรรทัดในใบ |
| `payments` | การรับเงิน |
| `payment_allocations` | จัดสรรเงินเข้าใบ |
| `receipts` | snapshot ใบเสร็จ |
| `payment_voids` | audit ยกเลิก |

### บริบทภาคเรียน (สำคัญ)

หลัง migration `20260524140000_semester_scoped_grades_enrollments.sql`:

- `student_enrollments` — UNIQUE `(student_id, semester_id)`; กรอง `status = 'enrolled'` ตามภาคใน header
- `grade_levels`, `classrooms` — ผูก `semester_id`
- `fee_rates` — ผูก `semester_id` (และ `academic_year_id`)

การสร้างใบแจ้งและรายงานใช้ **`semester_id` จาก header context** เป็นหลัก

### สถานะใบแจ้ง

| `paid_amount` vs `total_amount` | `status` |
|--------------------------------|----------|
| 0 | `unpaid` |
| 0 < paid < total | `partial` |
| paid ≥ total | `paid` |

อัปเดต `paid_amount` และ `status` ใน transaction เมื่อบันทึก/ยกเลิกการจ่าย

### เลขที่ใบเสร็จ

- `payments.receipt_number` — running ต่อ `academic_year_id` (UNIQUE คู่กับปี)
- สร้างใน Server Action (ดึง max + 1 หรือ sequence ใน transaction)

### RLS (มีอยู่แล้ว)

| ตาราง | admin | finance | teacher |
|-------|-------|---------|---------|
| fee_items, fee_rates, receipt_types | write | — | — |
| student_invoices, invoice_lines | all | all | select (scoped) |
| payments, allocations, receipts, voids | all | all | select (scoped) |

Teacher scope: join `teacher_assignments` → `classrooms` → `student_enrollments` ใน semester ปัจจุบัน

---

## 4. Sidebar Navigation

อัปเดต `financeNav` ใน `app-sidebar.tsx`:

```
การเงิน
  ตั้งค่าค่าธรรมเนียม     → /fee-rates
  ประเภทใบเสร็จ          → /receipt-types
  ใบแจ้งชำระ             → /invoices
  บันทึกการจ่าย          → /payments
  รายงานค้างชำระ         → /reports/outstanding
  สรุปการเก็บ            → /reports/collections
```

Redirect `/reports` → `/reports/outstanding` (optional, แนะนำ)

---

## 5. Access Control

### หน้า

| Route | admin | finance | teacher |
|-------|-------|---------|---------|
| `/fee-rates`, `/receipt-types` | ✓ | redirect `/` | redirect `/` |
| `/invoices` | ✓ | redirect `/` | redirect `/` |
| `/payments` | ✓ | ✓ | redirect `/` |
| `/reports/outstanding`, `/reports/collections` | ✓ | ✓ | ✓ (ข้อมูลจำกัดห้อง) |

### Server Actions

| Action group | admin | finance |
|--------------|-------|---------|
| fee-items, fee-rates, receipt-types | ✓ | — |
| invoices (generate, discount) | ✓ | — |
| payments (record, void) | ✓ | ✓ |

เพิ่ม `src/lib/auth/require-finance.ts`:

- `requireFinancePage()` — admin หรือ finance
- `requireFinanceAction()` — สำหรับ payments
- ใช้ร่วมกับ `requireAdminPage()` / `requireAdminAction()` ที่มีอยู่

---

## 6. Page Designs

### 6.1 ตั้งค่าค่าธรรมเนียม (`/fee-rates`)

**Header:** แสดง year/semester selector

**ส่วนที่ 1 — รายการค่าใช้จ่าย (`fee_items`)**

- ตาราง: ชื่อ, ค่าเทอมหลัก (badge), สถานะใช้งาน
- Dialog เพิ่ม/แก้ไข: `name`, `description` (optional), `is_tuition`, `is_active`
- ไม่ลบถาวรถ้ามี `fee_rates` หรือ `invoice_lines` อ้างอิง — ปิด `is_active` แทน

**ส่วนที่ 2 — อัตราค่าธรรมเนียม (`fee_rates`)**

- ตาราง matrix: แถว = `grade_levels` ในภาคที่เลือก, คอลัมน์ = `fee_items` ที่ `is_active`
- เซลล์ = จำนวนเงิน (฿), `tabular-nums`
- ปุ่ม **บันทึกการเปลี่ยนแปลง** — upsert ทุกเซลล์ที่แก้ในรอบเดียว (ลด round-trip)
- Empty state: ยังไม่มีชั้นในภาค → ลิงก์ไป `/registration`

**Default `receipt_type_id` บน fee_rates:** ใช้ประเภทใบเสร็จ default (รหัส "01") ถ้ามี; ไม่บังคับ UI แยกต่อเซลล์ใน v1

---

### 6.2 ประเภทใบเสร็จ (`/receipt-types`)

- ตาราง CRUD: `code`, `name`, `description`, `is_active`
- Validation: `code` unique, trim, ไม่ว่าง
- Seed เริ่มต้นมีในฐานข้อมูลแล้ว

---

### 6.3 ใบแจ้งชำระ (`/invoices`)

**รายการ**

- ค้นหา: รหัส/ชื่อนักเรียน
- กรอง: ชั้น, ห้อง, สถานะใบ (`unpaid` / `partial` / `paid`)
- คอลัมน์: รหัส, ชื่อ, ชั้น/ห้อง, ชื่อใบ, ยอดรวม, ชำระแล้ว, ค้าง, สถานะ (badge + ข้อความไทย)
- Pagination 50 แถว/หน้า (ตาม pattern นักเรียน)

**สร้างใบ — โหมดทั้งภาค**

1. ปุ่ม **สร้างใบแจ้งทั้งภาค**
2. Dialog: เลือกรายการ `fee_items` ที่จะใส่ (checkbox, default เลือกทุกรายการที่มี `fee_rate` สำหรับชั้นนั้น)
3. Server Action: สำหรับทุก `student_enrollments` ที่ `semester_id` = ภาคปัจจุบัน และ `status = 'enrolled'`:
   - ข้ามถ้ามีใบของ `(student_id, semester_id)` อยู่แล้ว
   - สร้าง `student_invoices` + `invoice_lines` จาก `fee_rates` ตาม `grade_level` ของห้อง
   - `invoice_name` เช่น `ภาคเรียนที่ {n}/{year.name}`
   - `subtotal` = sum(lines), `discount` = null, `total_amount` = subtotal

**สร้างใบ — โหมดเลือกกลุ่ม**

1. ปุ่ม **สร้างใบเฉพาะกลุ่ม**
2. เลือกชั้น → ห้อง (optional) → ติ๊กรายชื่อ (default เลือกทั้งหมดที่ยังไม่มีใบ)
3. Logic สร้างเหมือนโหมดทั้งภาค แต่จำกัดชุดนักเรียน

**แก้ไขใบ (ก่อนจ่ายครั้งแรก)**

- เปิดได้เมื่อ `paid_amount = 0`
- Dialog: แสดงบรรทัด (read-only ใน v1), ตั้ง `discount_type` (`percent` | `fixed`), `discount_value`
- คำนวณ: `total_amount = subtotal - discount` (ปัด 2 ทศนิยม)
- หลังมีการจ่ายแล้ว: ห้ามแก้ส่วนลด (แสดง readonly)

**ข้อความ error ตัวอย่าง**

- `มีใบแจ้งชำระของนักเรียนในภาคนี้แล้ว`
- `ยังไม่ได้ตั้งอัตราค่าธรรมเนียมสำหรับชั้น {name}`
- `ไม่มีนักเรียนที่ลงทะเบียนในภาคนี้`

---

### 6.4 บันทึกการจ่าย (`/payments`)

**Layout:** 2 คอลัมน์ (desktop); stack บน mobile

| ซ้าย | ขวา |
|------|-----|
| ค้นหานักเรียน (รหัส/ชื่อ), Enter ค้นหา | ข้อมูลนักเรียนที่เลือก |
| รายการค้นหาล่าสุด (session/local, optional) | ตารางใบค้างชำระ (unpaid + partial) |
| | ฟอร์ม: จำนวนเงิน, วิธี (เงินสด/โอน), เลขอ้างอิงโอน, หมายเหตุ |
| | ปุ่มหลัก **บันทึกและออกใบเสร็จ** (amber CTA ตาม theme) |

**จัดสรรเงิน (v1)**

- ถ้านักเรียนมีหลายใบค้าง: จัดสรรตามลำดับ **ใบเก่าก่อน** (`created_at` ASC) จนกว่าเงินจะหมด
- สร้าง `payment_allocations` ตามยอดที่จัดสรรจริง
- อัปเดต `paid_amount` และ `status` แต่ละใบ

**หลังบันทึกสำเร็จ**

1. Toast สำเร็จ
2. เปิด **ReceiptDialog** — แสดง `receipts.snapshot_data` (ชื่อนักเรียน, บรรทัด, ยอด, วันที่, เลขที่ใบเสร็จ)
3. ปุ่ม **พิมพ์** → `window.print()` บนเนื้อหาใน dialog (print stylesheet)
4. ปิด dialog แล้ว refresh รายการใบค้าง

**รายการการจ่าย (ด้านล่างหรือแท็บรอง)**

- กรองตามวันที่ (default วันนี้)
- คอลัมน์: เลขที่ใบเสร็จ, นักเรียน, จำนวน, วิธี, สถานะ
- การดำเนินการ: **พิมพ์ซ้ำ** (เปิด ReceiptDialog จาก snapshot), **ยกเลิก** (เฉพาะ `active`)

**ยกเลิกใบเสร็จ**

- AlertDialog + ช่องเหตุผล (บังคับ)
- สร้าง `payment_voids`, ถอย `paid_amount` บนใบที่เกี่ยวข้อง, `payments.status = voided`
- ทำใน transaction เดียว

---

### 6.5 รายงานค้างชำระ (`/reports/outstanding`)

ตาม parent spec §6.1:

| คอลัมน์ |
|--------|
| รหัสนักเรียน, ชื่อ-นามสกุล, ชั้น/ห้อง |
| ค่าใช้จ่าย (subtotal), ส่วนลด, ต้องชำระ, ชำระแล้ว, ค้างชำระ |

- กรอง: ชั้น, ห้อง, สถานะใบ
- Teacher: เห็นเฉพาะนักเรียนในห้องที่มอบหมาย
- Export: ไม่ทำใน v1

---

### 6.6 สรุปการเก็บ (`/reports/collections`)

ตาม parent spec §6.2:

| คอลัมน์ |
|--------|
| ชั้น, จำนวนนักเรียน (enrolled), ยอดที่ต้องเก็บ, ยอดที่เก็บได้, อัตรา % |

- คำนวณจาก `student_invoices` ในภาคที่เลือน
- Teacher: เห็นเฉพาะชั้นที่มีห้องที่มอบหมาย

---

## 7. Architecture

### Pattern

```
Server Component (page)
  → getSemesterPageContext / getPageHeaderProps
  → lib/data/finance/* (read)
  → Client *Panel (search, tables, dialogs)
      → lib/actions/finance/* (mutate)
      → revalidatePath(...)
```

### File layout (แนะนำ)

```
src/lib/auth/require-finance.ts
src/lib/finance/
  amounts.ts              # discount, status, allocation helpers
  amounts.test.ts
  receipt-number.ts       # next receipt number per year
  constants.ts            # labels, status badges
src/lib/data/
  fee-items.ts
  fee-rates.ts
  receipt-types.ts
  invoices.ts
  payments.ts
  reports.ts
src/lib/actions/
  fee-items.ts
  fee-rates.ts
  receipt-types.ts
  invoices.ts
  payments.ts
src/components/finance/
  fee-items-section.tsx
  fee-rates-matrix.tsx
  receipt-types-panel.tsx
  invoices-panel.tsx
  invoice-generate-dialog.tsx
  invoice-discount-dialog.tsx
  payments-panel.tsx
  receipt-dialog.tsx
  outstanding-report-panel.tsx
  collections-report-panel.tsx
src/app/(dashboard)/
  fee-rates/page.tsx
  receipt-types/page.tsx
  invoices/page.tsx
  payments/page.tsx
  reports/outstanding/page.tsx
  reports/collections/page.tsx
  reports/page.tsx          # redirect
```

### shadcn components

ใช้ที่มีอยู่: `dialog`, `alert-dialog`, `table`, `badge`, `input`, `select`, `sonner`  
เพิ่มถ้าจำเป็น: `tabs` (ถ้าไม่ใช้แยกหน้า), `checkbox`

### revalidatePath

หลัง mutate ที่เกี่ยวข้อง:

- `/fee-rates`, `/invoices`, `/payments`
- `/reports/outstanding`, `/reports/collections`
- `/` (dashboard stats)

---

## 8. Key Server Actions

### `generateInvoices(input)`

- Input: `semesterId`, `feeItemIds[]`, `studentIds[]` (ว่าง = ทั้งภาคตาม enrollments)
- Guard: admin
- Transaction: batch insert invoices + lines
- Return: `{ ok, created, skipped, errors? }`

### `updateInvoiceDiscount(invoiceId, discount)`

- Guard: admin, `paid_amount = 0`
- Recalculate `total_amount`

### `recordPayment(input)`

- Input: `studentId`, `amount`, `method`, `transferReference?`, `note?`, `semesterId` (from context)
- Guard: admin | finance
- Transaction: payment + allocations + receipt snapshot + invoice updates + receipt number

### `voidPayment(paymentId, reason)`

- Guard: admin | finance, `status = active`
- Transaction: void record + reverse allocations + invoice updates

---

## 9. Receipt Snapshot (`receipts.snapshot_data`)

JSON เก็บถาวรสำหรับพิมพ์ซ้ำ:

```json
{
  "receiptNumber": "2568/00042",
  "paidAt": "2026-05-24T10:30:00+07:00",
  "studentCode": "67001",
  "studentName": "เด็กชาย ตัวอย่าง เรียนดี",
  "gradeClassroom": "ป.1 / 1/1",
  "paymentMethod": "cash",
  "transferReference": null,
  "amount": 5000,
  "allocations": [
    { "invoiceName": "ภาคเรียนที่ 1/2568", "amount": 5000 }
  ],
  "recordedBy": "เจ้าหน้าที่การเงิน"
}
```

---

## 10. Testing Strategy

| ชั้น | เนื้อหา |
|------|---------|
| Unit | `lib/finance/amounts.ts` — discount, status, allocation FIFO |
| Unit | `receipt-number.ts` — format, increment logic (mock) |
| Manual | Setup fee → generate batch → partial pay → void → reports |

ไม่บังคับ E2E ใน v1

---

## 11. Implementation Phases

| Phase | เนื้อหา | ทดสอบได้ |
|-------|---------|----------|
| 1 | fee-items, fee-rates, receipt-types pages + actions | ตั้งราคาตามชั้น |
| 2 | invoices list + generate (batch + selected) + discount | มีใบค้างชำระ |
| 3 | payments walk-in + receipt modal + void | รับเงินและพิมพ์ |
| 4 | reports outstanding + collections + sidebar | รายงานตรงยอด |

---

## 12. UX Checklist (from parent spec)

- ปี/ภาคใน header เสมอบนหน้าปฏิบัติการ
- ปุ่มหลักเด่นต่อขั้นตอน (สร้างใบ / บันทึกและออกใบเสร็จ)
- สถานะใช้ badge + ข้อความไทย (ไม่พึ่งสีอย่างเดียว)
- ยกเลิกใบเสร็จ → dialog + เหตุผลบังคับ
- Empty states ชี้ขั้นตอนถัดไป
- Toast หลังบันทึกสำเร็จ

---

## 13. Deviations from Parent Spec

| Parent | Finance spec |
|--------|----------------|
| `/payments/[id]/receipt` route | ReceiptDialog modal on `/payments` |
| `/reports` single area | Split `/reports/outstanding` and `/reports/collections` |
| Semester enrollment UNIQUE per year | UNIQUE per `semester_id` (post-migration) |

---

## 14. Open Items (none for v1)

ทุกข้อตัดสินใจใน brainstorming ปิดแล้ว — พร้อมเขียน implementation plan

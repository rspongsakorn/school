# Dual-Pricing สำหรับรายการค่าใช้จ่าย (เบิกได้ / เบิกไม่ได้)

วันที่: 2026-05-28
สถานะ: ออกแบบเสร็จ รอ implement

## 1. ที่มาและเป้าหมาย

ผู้ปกครองบางคนสามารถนำใบเสร็จไปเบิกจากต้นสังกัดได้ ส่วนใหญ่ราคาที่ระบุในใบเสร็จที่นำไปเบิกจะสูงกว่าราคาที่ผู้ปกครองที่เบิกไม่ได้จ่ายจริง โรงเรียนจึงต้องการระบบที่:

- ตั้งราคาได้ 2 ระดับต่อรายการค่าใช้จ่าย: "ปกติ (เบิกไม่ได้)" และ "เบิกได้"
- ตอนออกใบแจ้งชำระ เจ้าหน้าที่ติ๊กเลือกได้ว่านักเรียนคนไหนใช้ราคา "เบิกได้"
- ใบเสร็จที่ปริ้นไม่แสดง label "เบิกได้/เบิกไม่ได้" — ออกมาเป็นใบมาตรฐาน แต่ราคาต่างกัน
- หน้าจัดการในระบบเห็น label ชัด เพื่อเจ้าหน้าที่ตรวจสอบ

## 2. ขอบเขต

In-scope:
- เพิ่ม flag dual-pricing ที่ระดับ `fee_items` (ตั้งได้ทีละรายการ — ไม่บังคับว่าทุกรายการต้องเป็น dual)
- ตั้งราคาเบิกได้ในตาราง fee_rates matrix
- ติ๊กเลือก variant ต่อรายนักเรียน ใน dialog สร้างใบแจ้งชำระ
- แก้ variant ได้ภายหลัง ตราบใดที่ยังไม่ชำระ (เหมือนระบบ discount)
- แสดง badge "เบิกได้" ในหน้าจัดการ + filter + รายงาน

Out-of-scope:
- ไม่ตั้ง flag เบิกได้ที่ระดับ `students` หรือ `student_enrollments` (เจ้าหน้าที่ติ๊กทุกครั้งที่สร้างใบ)
- ไม่เปลี่ยน template ใบเสร็จที่ปริ้น
- ไม่รองรับ variant อื่นนอกจาก "ปกติ" และ "เบิกได้" (เช่น ลูกครู ทุน) — ถ้าจำเป็นในอนาคต ค่อย refactor เป็น variant table

## 3. Data Model

### 3.1 `fee_items` — เพิ่มฟิลด์

```
has_reimbursable_variant  boolean  default false
```

### 3.2 `fee_rates` — เพิ่มฟิลด์

```
amount                (เดิม)  ราคามาตรฐาน / ราคาเบิกไม่ได้
amount_reimbursable   numeric nullable  ราคาเบิกได้ — ใช้เมื่อ fee_item.has_reimbursable_variant=true
```

ถ้า `amount_reimbursable` เป็น null แต่ fee_item เปิด dual pricing → fallback ไปใช้ `amount` (ยืดหยุ่นกว่า bound ทุก row)

### 3.3 `student_invoices` — เพิ่มฟิลด์

```
is_reimbursable  boolean  default false
```

flag ระดับ "ทั้งใบ" — กำหนดว่าใบนี้ใช้ราคาเบิกได้สำหรับ fee_items ที่มี variant

### 3.4 `invoice_lines` — เพิ่มฟิลด์

```
variant  text  default 'standard'
```

ค่าที่อนุญาต: `'standard'` | `'reimbursable'`

เป็น snapshot ไว้แสดง badge ในระบบ — ไม่กระทบ amount (amount เป็น snapshot จาก fee_rates ณ ตอนสร้างแล้ว)

### 3.5 Logic การเลือกราคา (ตอนสร้าง / re-snapshot)

```
for each line:
  if invoice.is_reimbursable
     AND fee_item.has_reimbursable_variant
     AND fee_rate.amount_reimbursable IS NOT NULL:
    line.amount  = fee_rate.amount_reimbursable
    line.variant = 'reimbursable'
  else:
    line.amount  = fee_rate.amount
    line.variant = 'standard'
```

## 4. Migration

- เพิ่มคอลัมน์ทั้ง 4 ตารางด้วย default ที่ไม่กระทบของเดิม
  - `fee_items.has_reimbursable_variant = false`
  - `fee_rates.amount_reimbursable = null`
  - `student_invoices.is_reimbursable = false`
  - `invoice_lines.variant = 'standard'`
- ใบแจ้งชำระเก่าทั้งหมดจะ behave เป็น "standard" → ไม่กระทบข้อมูลเดิม

## 5. UI Changes

### 5.1 Fee Items Section ([src/components/finance/fee-items-section.tsx](../../../src/components/finance/fee-items-section.tsx))

- Dialog เพิ่ม/แก้ไข fee_item: เพิ่ม checkbox "มีราคาเบิกได้แยก"
- ตาราง: เพิ่ม badge "2 ราคา" ในคอลัมน์ประเภท (เมื่อเปิดใช้)

### 5.2 Fee Rates Matrix ([src/components/finance/fee-rates-matrix.tsx](../../../src/components/finance/fee-rates-matrix.tsx))

- cell ของรายการที่เปิด dual pricing → แสดง 2 input ซ้อน (label "ปกติ" / "เบิกได้")
- cell ของรายการ single-price → input เดียวเหมือนเดิม
- คอลัมน์ "รวม" คำนวณจากราคา "ปกติ" เป็นหลัก (ไม่ต้องแสดง 2 ค่ารวม — เพื่อความเรียบง่าย)

### 5.3 Invoice Generate Dialog ([src/components/finance/invoice-generate-dialog.tsx](../../../src/components/finance/invoice-generate-dialog.tsx))

โครงสร้างใหม่ของรายการนักเรียน (ทั้ง mode "ทั้งภาค" และ "เลือกเฉพาะ"):

```
☑ 12345  นาย ก    ม.1/1   [ ] เบิกได้
☑ 12346  น.ส. ข   ม.1/1   [✓] เบิกได้
☑ 12347  ด.ช. ค   ม.1/2   [ ] เบิกได้
```

- column ใหม่: checkbox "เบิกได้" ต่อรายคน (default = unchecked)
- ปุ่ม bulk: "ตั้งทุกคนเป็นเบิกได้" และ "ล้างทั้งหมด"
- mode "ทั้งภาค" → แสดงรายชื่อนักเรียนทั้งหมดด้วยเหมือนกัน ติ๊ก "เบิกได้" เฉพาะรายที่ต้องการ
- ปุ่ม "เลือกทั้งหมด" สำหรับ selection (เดิม) แยกจากปุ่ม bulk เบิกได้

### 5.4 Invoices Panel ([src/components/finance/invoices-panel.tsx](../../../src/components/finance/invoices-panel.tsx))

- badge ข้างชื่อนักเรียนในตาราง: "เบิกได้" (เมื่อ `is_reimbursable = true`)
- filter ใหม่: "ทั้งหมด / เบิกได้ / เบิกไม่ได้"

### 5.5 หน้ารายละเอียดใบแจ้ง / Dialog แก้ไข

- toggle "ราคาเบิกได้" (เปิด/ปิด `is_reimbursable`)
- เมื่อเปลี่ยน → trigger re-snapshot ของ invoice_lines โดย:
  - คำนวณ amount ใหม่จาก fee_rates ปัจจุบัน
  - update `variant` ต่อ line
  - คำนวณ `subtotal`, `total_amount` ใหม่ (ใช้ discount เดิม)
- block หาก `paid_amount > 0` (ลอจิกเดียวกับ `updateInvoiceDiscount`)
- แต่ละ invoice_line แสดง variant badge เล็กในตารางรายละเอียด

### 5.6 ใบเสร็จที่ปริ้น ([src/components/finance/receipt-dialog.tsx](../../../src/components/finance/receipt-dialog.tsx))

ไม่เปลี่ยน — ไม่แสดง variant ใดๆ ในใบที่ปริ้นออกมา

### 5.7 รายงาน

- [src/components/finance/outstanding-report-panel.tsx](../../../src/components/finance/outstanding-report-panel.tsx): เพิ่มคอลัมน์ "ประเภทราคา" + filter
- [src/components/finance/collections-report-panel.tsx](../../../src/components/finance/collections-report-panel.tsx): เพิ่ม filter (ไม่ต้องสรุปแยก — เพิ่มภายหลังได้)

## 6. Server Actions

### 6.1 fee-items (src/lib/actions/fee-items.ts)

- `createFeeItem` / `updateFeeItem`: รับ `hasReimbursableVariant: boolean`

### 6.2 fee-rates ([src/lib/actions/fee-rates.ts](../../../src/lib/actions/fee-rates.ts))

- `FeeRateUpsertEntry` เพิ่ม `amountReimbursable: number | null`
- `upsertFeeRates`: validation
  - ถ้า fee_item ไม่ใช่ dual → `amount_reimbursable` ต้องเป็น null
  - ถ้า fee_item เป็น dual → `amount_reimbursable >= 0` หรือ null (fallback)

### 6.3 invoices ([src/lib/actions/invoices.ts](../../../src/lib/actions/invoices.ts))

- `generateInvoices`: เพิ่ม input
  ```
  reimbursableStudentIds?: string[]   // set ของ student_id ที่ต้องการเป็นเบิกได้
  ```
  - ตอนสร้างแต่ละ invoice: ตั้ง `is_reimbursable` ตาม set นี้
  - ตอนคำนวณ line.amount: ใช้ logic ใน 3.5
- **action ใหม่:** `updateInvoiceReimbursable(invoiceId, isReimbursable: boolean)`
  - block ถ้า `paid_amount > 0` → return error
  - re-snapshot invoice_lines: คำนวณ amount + variant ใหม่จาก fee_rates ปัจจุบัน
  - อัพเดท subtotal + total_amount (ใช้ discount เดิม)
  - revalidate paths

### 6.4 Data Layer

- [src/lib/data/fee-items.ts](../../../src/lib/data/fee-items.ts): expose `hasReimbursableVariant`
- [src/lib/data/fee-rates.ts](../../../src/lib/data/fee-rates.ts): expose `amount_reimbursable`
- [src/lib/data/invoices.ts](../../../src/lib/data/invoices.ts): include `is_reimbursable` และ `variant` ใน invoice query results

## 7. Edge Cases

| สถานการณ์ | พฤติกรรม |
|---|---|
| fee_item dual แต่ fee_rate.amount_reimbursable=null | fallback ไป amount, variant='standard' |
| ปิด has_reimbursable_variant ของ fee_item ที่มี invoice เก่าใช้ variant='reimbursable' | invoice เก่า amount + variant ไม่เปลี่ยน (snapshot) แต่ถ้า re-snapshot จะ fallback ไป standard |
| เปลี่ยน is_reimbursable หลังชำระแล้ว | block + แสดง error เหมือน updateInvoiceDiscount |
| สร้าง invoice แบบ "ทั้งภาค" + ติ๊กเบิกได้บางคน | ใบของคนที่ติ๊ก is_reimbursable=true; คนอื่นๆ false |
| Generate ซ้ำสำหรับนักเรียนที่มีใบอยู่แล้ว | skip (พฤติกรรมเดิม — ไม่กระทบ) |

## 8. Testing Strategy

หน่วยทดสอบใหม่ที่ต้องเพิ่ม:

- `lib/finance/amounts.test.ts` หรือไฟล์ใหม่: ฟังก์ชัน `pickFeeAmount(rate, item, invoice)` คืน `{ amount, variant }`
- `lib/actions/invoices.ts`:
  - test `generateInvoices` กับ reimbursableStudentIds: บางคนได้ราคาเบิกได้ บางคนได้ปกติ
  - test `updateInvoiceReimbursable`: re-snapshot ถูกต้อง / block ถ้า paid > 0
  - test fallback เมื่อ amount_reimbursable=null
- Component test สำหรับ `FeeRatesMatrix`: render dual cell ถูกต้อง, save ส่ง amount_reimbursable

## 9. Implementation Order (Suggestion)

1. DB migration (เพิ่มคอลัมน์ทั้ง 4 ตาราง พร้อม default)
2. Data layer + types
3. `pickFeeAmount` helper + unit tests
4. Update `fee_items` action + UI dialog
5. Update `fee_rates` action + matrix UI (2 inputs)
6. Update `generateInvoices` + dialog UI (per-student tick)
7. New `updateInvoiceReimbursable` action + UI toggle
8. Badge + filter ใน invoices panel + reports
9. Manual E2E test ตามขั้นตอนการใช้งานจริง

## 10. Open Questions ที่ตัดสินแล้ว

- ✅ ระดับ flag: per fee_item (ไม่ใช่บังคับทุกรายการ)
- ✅ การเลือก: ติ๊กต่อรายในตอนสร้าง default = ไม่ติ๊ก
- ✅ การแก้ภายหลัง: เปลี่ยนได้ตราบใดที่ยังไม่ชำระ
- ✅ การแสดง: ในระบบเห็น label, ใบที่ปริ้นไม่แสดง
- ✅ fee_rate ราคาเบิกได้: ว่างได้ → fallback ไป amount
- ✅ ตำแหน่ง flag is_reimbursable: ที่ `student_invoices`
- ✅ Fee rates matrix layout: 2 input ซ้อนใน cell เดียวกัน
- ✅ Re-snapshot lines ตอนเปลี่ยน is_reimbursable: ใช่

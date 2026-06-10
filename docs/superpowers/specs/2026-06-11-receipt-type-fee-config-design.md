# Spec: ย้ายการตั้งค่าค่าธรรมเนียมเข้าไปในประเภทใบเสร็จ

วันที่: 2026-06-11

## ที่มาและเป้าหมาย

ปัจจุบัน "ประเภทใบเสร็จ" (`receipt_types`) ถูกตั้งค่าไว้ได้ แต่ระบบไม่เคยให้เลือกใช้จริง — ตอนรับเงิน
และตอน backfill import ใช้ประเภทเริ่มต้น (code `"01"`) เสมอ ขณะที่ "ค่าธรรมเนียม" (`fee_items` +
`fee_rates`) เป็นลิสต์กลางชุดเดียวที่ใช้ร่วมกันทั้งระบบ ทั้งสองคอนเซ็ปต์จึงแยกขาดจากกันโดยสิ้นเชิง

เป้าหมาย: ทำให้รายการค่าใช้จ่ายแต่ละรายการ **ผูกกับประเภทใบเสร็จได้เพียงประเภทเดียว** แล้วย้ายการตั้งค่า
ค่าธรรมเนียมจากหน้าเดี่ยว (`/fee-rates`) เข้าไปอยู่ "ต่อประเภทใบเสร็จ" ในหน้า `/receipt-types`
ผลลัพธ์คือประเภทใบเสร็จกลายเป็นแกนจัดระเบียบค่าธรรมเนียมจริง และไหลต่อไปถึงใบแจ้งหนี้และใบเสร็จ

## หลักการที่ตกลงกันแล้ว

- รายการค่าใช้จ่าย 1 รายการ ผูกกับประเภทใบเสร็จ **เพียง 1 ประเภท** (ความสัมพันธ์ใหม่ ไม่เคยมีมาก่อน)
- ใบแจ้งหนี้ 1 ใบ = ประเภทใบเสร็จ 1 ประเภท
- ใบเสร็จ 1 ใบ = ใบแจ้งหนี้ 1 ใบ (ตัดการรับเงินแบบ FIFO ข้ามหลายใบทิ้ง)
- UI ส่วนตั้งค่าค่าธรรมเนียม (ลิสต์รายการลากเรียงได้ + matrix อัตราตามชั้น) **คงรูปแบบเดิมทุกอย่าง**
  เพียงแต่ scope ลงเหลือ "ต่อประเภทใบเสร็จ" และย้ายไปอยู่ใน pop-up

## ขอบเขตการเปลี่ยนแปลง

### A. โมเดลข้อมูล + migration

1. ตาราง `fee_items`
   - เพิ่มคอลัมน์ `receipt_type_id uuid REFERENCES receipt_types(id)`
   - Backfill: รายการเดิมทั้งหมด → ประเภท default (`code = "01"`)
   - ตั้งเป็น `NOT NULL` หลัง backfill เสร็จ
   - `sort_order` เปลี่ยนความหมายเป็น "ลำดับภายในประเภท" — การ reorder จะ scope ต่อ `receipt_type_id`
     (ไม่ต้องเปลี่ยน schema ของคอลัมน์ แต่เปลี่ยน logic การจัดลำดับ)

2. ตาราง `student_invoices`
   - เพิ่มคอลัมน์ `receipt_type_id uuid REFERENCES receipt_types(id)`
   - Backfill: ใบแจ้งเดิมทั้งหมด → ประเภท default (`code = "01"`)

3. ตาราง `receipts` — ไม่เปลี่ยน schema (มี `receipt_type_id` อยู่แล้ว) แต่เปลี่ยนแหล่งที่มาของค่า
   (ดูข้อ D)

### B. หน้าตั้งค่าค่าธรรมเนียมต่อประเภท (pop-up)

หน้า `/receipt-types` ([receipt-types-panel.tsx](../../../src/components/finance/receipt-types-panel.tsx)):
- คงตารางประเภทใบเสร็จเดิม (รหัส / ชื่อ / สถานะ / จัดการ)
- ปุ่ม "แก้ไข" เดิม = แก้ code/name/description/active (ไม่เปลี่ยน)
- **เพิ่มปุ่มใหม่ต่อแถว** เช่น "ตั้งค่าค่าธรรมเนียม" → เปิด pop-up ของประเภทนั้น

Pop-up ตั้งค่าค่าธรรมเนียม (component ใหม่ เช่น `receipt-type-fee-dialog.tsx`):
- Dialog ขนาดใหญ่ (กว้างราว `sm:max-w-5xl`, สูง `max-h-[90vh]`, scroll ได้ — ตาม pattern เดียวกับ
  [invoice-generate-dialog.tsx](../../../src/components/finance/invoice-generate-dialog.tsx))
- หัวข้อ: "ตั้งค่าค่าธรรมเนียม — {ชื่อประเภท}"
- ภายในมี 2 ส่วน reuse component เดิม โดยส่ง `receiptTypeId` เข้าไป:
  1. [FeeItemsSection](../../../src/components/finance/fee-items-section.tsx) — รายการค่าใช้จ่าย
     ลากเรียงลำดับได้, เพิ่ม/แก้/ลบ (dialog ย่อยซ้อนได้ตาม pattern เดิม) — การ "เพิ่มรายการ" จะผูก
     `receipt_type_id` ของประเภทนี้อัตโนมัติ
  2. [FeeRatesMatrix](../../../src/components/finance/fee-rates-matrix.tsx) — อัตราตามชั้น
     คอลัมน์เป็นเฉพาะรายการของประเภทนี้, ตามภาคเรียนที่เลือกใน header เดิม, มีปุ่มบันทึก

ลบหน้า `/fee-rates`:
- ลบ route [src/app/(dashboard)/fee-rates/page.tsx](../../../src/app/(dashboard)/fee-rates/page.tsx)
- ลบ [fee-rates-page-panel.tsx](../../../src/components/finance/fee-rates-page-panel.tsx)
- ลบลิงก์เมนู nav ที่ชี้ไป `/fee-rates`
- FeeItemsSection / FeeRatesMatrix ยังคงอยู่ (ถูก reuse ใน pop-up)

### C. หน้าสร้างใบแจ้งชำระ

[invoice-generate-dialog.tsx](../../../src/components/finance/invoice-generate-dialog.tsx):
- เพิ่ม **ตัวเลือกประเภทใบเสร็จ** ด้านบน (ก่อนบล็อกรายการค่าใช้จ่าย)
- เมื่อเลือกประเภท → ลิสต์ "รายการค่าใช้จ่าย" filter เหลือเฉพาะรายการของประเภทนั้น
- ถ้ายังไม่เลือกประเภท → ปุ่มสร้างใบแจ้ง disabled

[generateInvoices](../../../src/lib/actions/invoices.ts):
- เพิ่ม `receiptTypeId` ใน input
- เขียน `receipt_type_id` ลงแต่ละแถวของ `student_invoices`
- validation: `feeItemIds` ที่ส่งมาต้องเป็นของ `receiptTypeId` เดียวกัน

### D. รับเงิน (รื้อเป็นรายใบแจ้ง)

[invoice-payment-dialog.tsx](../../../src/components/finance/invoice-payment-dialog.tsx):
- เดิมโหลดใบค้างทั้งหมดของนักเรียนแล้ว FIFO รวม → เปลี่ยนเป็น **จ่ายเฉพาะใบแจ้งที่คลิก**
- โหลด/แสดงเฉพาะใบแจ้งใบนั้น, ยอด default และ max = ยอดค้างของใบนั้น

[recordPayment](../../../src/lib/actions/payments.ts):
- เปลี่ยน input จาก "amount ระดับนักเรียน + FIFO" เป็น **รับ `invoiceId` + amount**
- จัดสรรเงินลงใบแจ้งใบเดียว (`payment_allocations` มีแถวเดียว)
- `receipts.receipt_type_id` = `receipt_type_id` ของใบแจ้งใบนั้น (แทน `getDefaultReceiptTypeId()`)
- `snapshot.allocations` มีรายการเดียว
- จ่ายไม่เต็มจำนวนได้ → ใบแจ้งคงสถานะค้างบางส่วน, จ่ายงวดถัดไปออกใบเสร็จใบใหม่
  (1 ใบแจ้ง → หลายใบเสร็จได้เมื่อจ่ายหลายงวด แต่ 1 ใบเสร็จ → 1 ใบแจ้งเสมอ)
- helper `allocatePaymentFifo` ที่ไม่ถูกใช้แล้วให้พิจารณาลบ/ลดบทบาท

CSV backfill import (บล็อกที่สองใน [payments.ts](../../../src/lib/actions/payments.ts) เป็นข้อมูลย้อนหลัง):
- พยายาม derive `receipt_type_id` จากใบแจ้งที่จับคู่ได้
- ถ้าจับคู่ใบแจ้งไม่ได้ → fallback ประเภทdefault `"01"` (ยอมรับได้เพราะเป็นข้อมูลย้อนหลัง)

### Query / action ที่กระทบ

- `listFeeItems` / `fetchFeeItems` → รับพารามิเตอร์ `receiptTypeId` เพื่อ filter
- `createFeeItem` → require `receiptTypeId`
- `reorderFeeItems` → scope การจัดลำดับต่อ `receiptTypeId`
- `getFeeRateMatrix(semesterId, receiptTypeId)` → filter รายการตามประเภท
- `getStudentOutstandingInvoices` / `getStudentOutstandingAction` → รองรับการดึงใบแจ้งใบเดียว

## สิ่งที่อยู่นอกขอบเขต (YAGNI)

- ไม่ทำ many-to-many ระหว่างรายการค่าใช้จ่ายกับประเภทใบเสร็จ (ตกลงเป็น 1:1)
- ไม่ทำการรับเงินข้ามประเภทในใบเสร็จเดียว
- ไม่ย้าย/แก้รายงานการเงินอื่นนอกเหนือจากที่ schema เปลี่ยนบังคับให้ต้องแก้
- ไม่เปลี่ยนรูปแบบ UI ของ FeeItemsSection / FeeRatesMatrix (คงเดิมทุกอย่าง)

## ลำดับการทำที่แนะนำ

1. Migration + backfill (`fee_items.receipt_type_id`, `student_invoices.receipt_type_id`)
2. ปรับ data/query/action layer ให้รับ `receiptTypeId` (fee items, matrix, reorder, create)
3. สร้าง pop-up ตั้งค่าค่าธรรมเนียมต่อประเภท + เสียบปุ่มใน `/receipt-types`
4. ลบหน้า `/fee-rates` + ลิงก์เมนู
5. เพิ่มตัวเลือกประเภทในหน้าสร้างใบแจ้ง + ปรับ `generateInvoices`
6. รื้อ flow รับเงินเป็นรายใบแจ้ง + ปรับ `recordPayment` + ที่มา `receipt_type_id` ของใบเสร็จ
7. ปรับ CSV backfill import ให้ derive ประเภทจากใบแจ้ง

## เกณฑ์ความสำเร็จ

- หน้า `/fee-rates` หายไป ตั้งค่าค่าธรรมเนียมได้จาก pop-up ในแต่ละประเภทใบเสร็จ โดย UI เหมือนเดิม
- รายการค่าใช้จ่ายแต่ละรายการแสดงและแก้ไขได้เฉพาะภายในประเภทที่มันสังกัด ลากเรียงลำดับได้ภายในประเภท
- สร้างใบแจ้งโดยเลือกประเภทใบเสร็จก่อน แล้วเห็นเฉพาะรายการของประเภทนั้น
- รับเงินทีละใบแจ้ง ออกใบเสร็จ 1 ใบต่อ 1 ใบแจ้ง และใบเสร็จได้ประเภทจากใบแจ้ง
- ข้อมูลเดิม (รายการ/ใบแจ้ง/ใบเสร็จ) ยังถูกต้องหลัง migration (ผูกกับประเภท `"01"`)

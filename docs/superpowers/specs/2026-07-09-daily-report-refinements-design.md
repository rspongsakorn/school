# Design Spec: ปรับปรุงเอกสารรายงานรายวัน (ปีการศึกษา + A4 แนวนอน + รายการจริงในใบนำส่งเงิน)

**Date:** 2026-07-09
**Status:** Approved
**Parent:** [2026-07-09-daily-report-document-types-design.md](./2026-07-09-daily-report-document-types-design.md)
**Scope:** ปรับปรุง 2 เอกสารที่เพิ่งเพิ่มใน `/reports/daily` — (1) รายงานการออกใบเสร็จ: เพิ่มคอลัมน์ปีการศึกษา + พิมพ์ A4 แนวนอน (2) ใบนำส่งเงินประจำวัน: แยกรายการตามประเภทใบเสร็จจริงแทนบรรทัดเดียวคงที่

---

## 1. Overview

จากฟีเจอร์เดิม (เอกสารรายงานรายวัน 2 ประเภท) มี 2 จุดที่ต้องแก้ไข:

1. **รายงานการออกใบเสร็จ** — ยังไม่มีคอลัมน์ "ปีการศึกษา" ตามตัวอย่างเอกสารต้นฉบับ และพิมพ์ออกมาเป็นแนวตั้ง (A4 portrait) ทั้งที่ตารางมีคอลัมน์เยอะ ควรพิมพ์แนวนอน (A4 landscape)
2. **ใบนำส่งเงินประจำวัน** — รายการ (ตาราง "ลำดับ/รหัสรายการ/รายการ/จำนวนเงิน") เป็นค่าคงที่ปลอมทั้งหมด (รหัส "01121", รายการ "ค่าใช้จ่ายอื่นๆ") ไม่ได้สะท้อนว่าเงินที่เก็บมาในวันนั้นเป็นค่าอะไรบ้างจริง ๆ ต้องแยกเป็นหลายบรรทัดตามประเภทเงินที่เก็บจริง

**Out of scope:** ไม่เพิ่มตัวกรองใหม่, ไม่เปลี่ยน logic การคำนวณยอดสรุปเดิม (`groupDailyRevenue`), ไม่แก้ตารางสรุปรายวัน (docType "summary")

---

## 2. Decisions (brainstorming)

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| แหล่งข้อมูลรายการในใบนำส่งเงิน | แยกตาม **ประเภทใบเสร็จ** (`receipt_types`) ผ่าน `payments → payment_allocations → student_invoices.receipt_type_id → receipt_types` — เป็นข้อมูลจริงที่มีอยู่แล้วในระบบ ไม่ต้องเพิ่ม schema ใหม่ |
| ค่าที่แสดงในคอลัมน์ "ปีการศึกษา" | รูปแบบ "ภาค/ปี" เช่น "1/2569" — ค่าเดียวกันทุกแถว (เพราะรายงานถูกกรองด้วยปีการศึกษาเดียวอยู่แล้วผ่าน context ที่เลือกไว้บนหน้า) ไม่ต้อง query เพิ่ม ใช้ `ctx.semesterNumber`/`ctx.academicYearName` ที่ panel มีอยู่แล้ว ส่งเป็น prop เข้าไปยัง component |
| ขนาดกระดาษ | A4 landscape เฉพาะตอนพิมพ์เอกสาร "รายงานการออกใบเสร็จ" เท่านั้น (ไม่กระทบเอกสารอื่นในหน้าเดียวกัน) |
| กรณีไม่มี allocation | ถ้า payment ไม่มี allocation ผูกกับ invoice (ไม่ควรเกิดตามกติการะบบปัจจุบันที่ `student_invoices.receipt_type_id` เป็น `NOT NULL` เสมอ) ยอดนั้นจะไม่ถูกนับในรายการแยกตามประเภท — เป็นข้อจำกัดที่ยอมรับได้ ไม่ต้องจัดการเพิ่มเติม |

---

## 3. รายงานการออกใบเสร็จ — เพิ่มคอลัมน์ปีการศึกษา + พิมพ์ A4 แนวนอน

### 3.1 คอลัมน์ปีการศึกษา

- `ReceiptIssuanceView` รับ prop ใหม่ `yearSemesterLabel: string` (เช่น `"1/2569"`) จาก `DailyRevenuePanel` (คำนวณจาก `ctx.semesterNumber` + `ctx.academicYearName` แบบเดียวกับที่ `ReportLetterhead` ใช้อยู่แล้ว)
- เพิ่มคอลัมน์ "ปีการศึกษา"ในตาราง วางต่อจากคอลัมน์ "วันที่" (ตามลำดับคอลัมน์ในเอกสารต้นฉบับ) ก่อนคอลัมน์ "รหัสนักเรียน"
- ทุกแถวแสดงค่าเดียวกัน (`yearSemesterLabel`) เพราะข้อมูลถูกกรองด้วยปีการศึกษาเดียวจาก context อยู่แล้ว
- แถวรวม (รวมทั้งช่วง) ต้องขยาย `colSpan` ของ label ให้ครอบคลุมคอลัมน์ใหม่ (จาก `colSpan={5}` เป็น `colSpan={6}`)

### 3.2 พิมพ์ A4 แนวนอน

- เพิ่ม `<style>{"@media print { @page { size: A4 landscape; } }"}</style>` ไว้ใน `ReceiptIssuanceView` เอง (render เฉพาะตอน component นี้ mount อยู่)
- เหตุผลที่ต้องทำแบบนี้แทนการแก้ CSS กลาง: กฎ `@page` มีผลกับทั้งเอกสารที่กำลังพิมพ์ ไม่สามารถ scope ด้วย class ได้ตรง ๆ การ render `<style>` เฉพาะตอนเอกสารนี้แสดงอยู่ ทำให้กระทบเฉพาะตอนผู้ใช้กด "พิมพ์" ขณะเลือกเอกสารนี้เท่านั้น ไม่กระทบเอกสารอื่น (สรุปรายวัน, ใบนำส่งเงิน) ที่ยังพิมพ์แนวตั้งตามเดิม

---

## 4. ใบนำส่งเงินประจำวัน — รายการจริงตามประเภทใบเสร็จ

### 4.1 Query ใหม่: `fetchDailyRemittanceItems`

ใน `src/lib/queries/reports.ts`:

```ts
export type DailyRemittanceItem = {
  receiptTypeId: string;
  code: string;
  name: string;
  amount: number;
};

export async function fetchDailyRemittanceItems(params: {
  academicYearId: string;
  dateFrom: string;
  dateTo: string;
  method?: "all" | "cash" | "transfer";
}): Promise<DailyRemittanceItem[]>
```

- Query จาก `payment_allocations` join `payments!inner` (กรอง `status = active`, `academic_year_id`, ช่วง `paid_at`, และ `payment_method` ถ้าเลือกวิธีจ่ายเฉพาะ) join `student_invoices!inner (receipt_type_id, receipt_types (code, name))`
- Group by `receipt_type_id` รวม `amount` ของ allocation ในกลุ่มนั้น
- เรียงผลลัพธ์ตาม `code` (ตัวอักษร/ตัวเลขน้อยไปมาก)
- ยอดรวมของรายการทั้งหมด (`sum of amount`) ควรเท่ากับยอดรวม active ของ `summary` (มาจากชุด payments เดียวกัน) — ไม่ต้องเขียนโค้ดตรวจสอบ ความสอดคล้องเป็นผลธรรมชาติจากการ derive จากข้อมูลเดียวกัน

### 4.2 UI: `DailyRemittanceSlip`

- รับ prop ใหม่ `items: DailyRemittanceItem[]` แทนการ hardcode แถวเดียว
- Render 1 แถวต่อ `item`: ลำดับ (index+1), `item.code`, `item.name`, `formatBaht(item.amount)`
- ถ้า `items` ว่าง (ไม่มีข้อมูลในช่วงที่เลือก — ซึ่งไม่ควรเกิดเพราะ parent เช็ค `summary.length === 0` ไว้ก่อนแล้วถึงจะ render component นี้) ให้แสดงแถวเดียวไม่มีในทางปฏิบัติ ไม่ต้องเขียน empty state พิเศษเพิ่ม เพราะ parent gate ครอบไว้แล้ว
- `totalReceipts` (รวมรายรับ) เปลี่ยนจาก `summary.reduce(...)` เป็น `items.reduce((sum, i) => sum + i.amount, 0)` — ค่าที่ได้เท่ากันในทางตรรกะกับของเดิม แต่คำนวณจาก items ตรง ๆ เพื่อให้ตารางกับยอดรวมมาจากแหล่งเดียวกันเสมอ (ลดความเสี่ยงตัวเลขไม่ตรงกันถ้าข้อมูลเพี้ยน)

### 4.3 การดึงข้อมูลใน panel

- `DailyRevenuePanel` เรียก `fetchDailyRemittanceItems` เป็น query แยกจาก `fetchDailyRevenue` (คนละ endpoint, คนละ query key) แต่ใช้ตัวกรอง (`dateFrom`, `dateTo`, `method`, `academicYearId`) ชุดเดียวกัน — เรียกเฉพาะตอน `docType === "remittance"` (`enabled: !!ctx && docType === "remittance"`) เพื่อไม่ต้อง query ทุกครั้งที่โหลดหน้าโดยไม่จำเป็น

---

## 5. Testing

- Unit: ไม่มี logic ใหม่ที่ซับซ้อนพอจะต้องมี unit test แยก (การ group by receipt_type เป็น query-level aggregation คล้าย `fetchDiscountReport` ที่มีอยู่แล้วในไฟล์เดียวกัน ไม่มี test สำหรับฟังก์ชันนั้นเช่นกัน — สอดคล้องกับ pattern เดิม)
- Manual: ตรวจสอบว่า
  - "รายงานการออกใบเสร็จ" มีคอลัมน์ปีการศึกษาถูกต้อง และ print preview ออกมาเป็น A4 แนวนอน
  - "ใบนำส่งเงินประจำวัน" แสดงรายการแยกตามประเภทใบเสร็จจริงตามข้อมูลที่มี ยอดรวมตรงกับตารางสรุปรายวัน
  - สลับ docType อื่น (สรุปรายวัน) ไม่ถูกกระทบ (ไม่กลายเป็น A4 แนวนอน, ไม่มีการเรียก query ใหม่โดยไม่จำเป็น)

---

## 6. ไฟล์ที่เกี่ยวข้อง

**แก้:**
- `src/lib/queries/reports.ts` (เพิ่ม `fetchDailyRemittanceItems`, type `DailyRemittanceItem`)
- `src/components/finance/receipt-issuance-view.tsx` (คอลัมน์ปีการศึกษา + `<style>` A4 landscape)
- `src/components/finance/daily-remittance-slip.tsx` (รับ `items` แทนค่าคงที่)
- `src/components/finance/daily-revenue-panel.tsx` (ส่ง `yearSemesterLabel` เข้า `ReceiptIssuanceView`, เพิ่ม query `fetchDailyRemittanceItems` ส่ง `items` เข้า `DailyRemittanceSlip`)

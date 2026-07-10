# Design Spec: เอกสารรายงานรายวัน 2 ประเภท

**Date:** 2026-07-09
**Status:** Approved
**Parent:** [2026-05-29-reporting-system-design.md](./2026-05-29-reporting-system-design.md)
**Scope:** เพิ่มรูปแบบเอกสารพิมพ์ 2 แบบในหน้า `/reports/daily` เดิม — รายงานการออกใบเสร็จ (flat list) และ ใบนำส่งเงินประจำวัน (remittance slip) — อิงตัวอย่างเอกสารจากระบบ MISSCHOOL เดิม

---

## 1. Overview

หน้า `/reports/daily` (รายรับรายวัน) ปัจจุบันมีมุมมองเดียว: ตารางสรุปยอดรายวัน (กางดูรายละเอียดใบเสร็จได้ต่อวัน). งานนี้เพิ่ม selector "รูปแบบเอกสาร" ให้เลือกได้ 3 แบบ โดยใช้ตัวกรองเดิม (ช่วงวันที่ + วิธีจ่าย) ร่วมกันทั้งหมด:

1. **สรุปรายวัน** (เดิม) — ตารางสรุป 1 แถว/วัน
2. **รายงานการออกใบเสร็จ** (ใหม่) — ตารางแบนรายใบเสร็จ (1 แถว/ใบเสร็จ) พร้อมยอดรวม
3. **ใบนำส่งเงินประจำวัน** (ใหม่) — ใบสรุปนำส่งเงินสด พร้อมช่องลงชื่อ

**Out of scope:** route ใหม่, เมนูใหม่ใน sidebar, ตัวกรองเพิ่มเติม (ประเภท/ทำรายการโดย), การกรอกหมายเหตุ/ชื่อผู้ส่งเงินอัตโนมัติ, การรองรับรายจ่าย (มีแต่รายรับ)

---

## 2. Decisions (brainstorming)

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| ตำแหน่ง | ฝังในหน้า `/reports/daily` เดิม ผ่าน selector รูปแบบเอกสาร ไม่แยก route |
| ตัวกรอง | ใช้ตัวกรองเดิม (ช่วงวันที่ + วิธีจ่าย) ไม่เพิ่มตัวกรอง "ประเภท"/"ทำรายการโดย" |
| ใบนำส่งเงิน — รายการหมายเหตุ | ไม่มีช่องกรอกเพิ่ม อัตโนมัติทั้งหมดจากยอดที่คำนวณได้ |
| ใบนำส่งเงิน — ลงชื่อ | เว้นว่างทั้งสองช่อง (ผู้ส่งเงิน / หัวหน้าฝ่ายบัญชี) ให้เซ็นด้วยลายมือหลังพิมพ์ |
| ใบนำส่งเงิน — รายจ่าย | ไม่มีข้อมูลรายจ่ายในระบบ แสดง "รวมรายจ่าย = 0.00" เสมอ |
| การพิมพ์ | ใช้ `ReportToolbar` + `ReportLetterhead` เดิม, print CSS เดิม |

---

## 3. Data layer changes

### 3.1 `src/lib/queries/reports.ts` — `fetchDailyRevenue`

ขยาย `DailyDetailReceipt` เพิ่ม 2 ฟิลด์:

```ts
export type DailyDetailReceipt = {
  // ...existing fields
  gradeClassroom: string;   // จาก getStudentGradeMap(semesterId) — เหมือน outstanding/collections
  recordedByName: string;   // จาก payments.recorded_by -> profiles.display_name
};
```

- `fetchDailyRevenue` ต้องรับ `semesterId` เพิ่ม (สำหรับ `getStudentGradeMap`) — ผ่านมาจาก `ctx.semesterId` ที่ panel มีอยู่แล้ว
- เพิ่ม join `recorded_by` ในการ select payments: `recorded_by, profiles!payments_recorded_by_fkey ( display_name )` (ชื่อ constraint ให้ตรวจสอบตอน implement จริงจาก schema — FK คือ `payments.recorded_by -> profiles.id`)
- ถ้า join ไม่ได้ (data มาจาก view อื่น) ให้ query profiles แยกเป็น map เหมือน `getStudentGradeMap` (fetch รายชื่อ `recorded_by` ที่ไม่ซ้ำ แล้ว map เป็น display_name)

**ไม่แก้ logic การจัดกลุ่ม/นับยอดเดิม** (`groupDailyRevenue` เดิมไม่แตะ)

---

## 4. UI: Document type selector

**ไฟล์:** `src/components/finance/daily-revenue-panel.tsx`

- เพิ่ม state `docType: "summary" | "receipts" | "remittance"` (default `"summary"`)
- เพิ่ม `Select` ในแถว toolbar (ก่อน/หลัง select วิธีจ่าย): รายการ `[สรุปรายวัน, รายงานการออกใบเสร็จ, ใบนำส่งเงินประจำวัน]`
- Render แบบ conditional:
  - `summary` → ตารางเดิมทั้งหมด (ไม่แก้)
  - `receipts` → `<ReceiptIssuanceView />`
  - `remittance` → `<DailyRemittanceSlip />`
- ทั้งสอง component ใหม่รับ props จากข้อมูลที่ query มาแล้ว (`data`, `dateFrom`, `dateTo`) — ไม่ query ซ้ำ

---

## 5. Component: `ReceiptIssuanceView`

**ไฟล์ใหม่:** `src/components/finance/receipt-issuance-view.tsx`

ตารางแบน 1 แถว/ใบเสร็จ รวมทุกวันในช่วงที่เลือก เรียงตาม `paidAt` (เก่า→ใหม่ ตามตัวอย่าง):

| เลขที่ใบเสร็จ | วันที่ | เวลา | รหัสนักเรียน | ชื่อ | ชั้น/ห้อง | จำนวนเงิน | วิธีจ่าย | สถานะ | ทำรายการโดย |
|---|---|---|---|---|---|---|---|---|---|

- แถวท้าย: ยอดรวม (เฉพาะ `status = active`, เหมือนหน้าอื่น)
- รายการ voided แสดงพร้อม badge "ยกเลิก" เหมือนมุมมองสรุป แต่ไม่รวมยอด
- ไม่มี pagination (ใช้ scroll ตามตารางอื่นในระบบ)

**Props:** `{ receiptsByDate: Record<string, DailyDetailReceipt[]> }` (flatten + sort ภายใน component)

---

## 6. Component: `DailyRemittanceSlip`

**ไฟล์ใหม่:** `src/components/finance/daily-remittance-slip.tsx`

เลย์เอาต์ตามตัวอย่าง "ใบนำส่งเงินประจำวัน":

- หัวข้อ: ชื่อโรงเรียน (จาก `ReportLetterhead` ที่มีอยู่แล้วด้านบน — ไม่ซ้ำ), "ใบนำส่งเงินประจำวัน", ช่วงวันที่ (dateFrom ถึง dateTo)
- ตารางบรรทัดเดียว: รหัสรายการ `01121`, รายการ "ค่าใช้จ่ายอื่นๆ", จำนวนเงิน = ยอดรวมทั้งช่วง (`total` จาก summary, active only)
- สรุป: รวมรายรับ = ยอดรวม, รวมรายจ่าย = 0.00 (คงที่), รวมเป็นเงิน = รวมรายรับ − รวมรายจ่าย
- บรรทัดจำนวนเงินเป็นตัวอักษร: ใช้ `bahtText(total)` จาก `src/lib/format.ts` (มีอยู่แล้ว)
- ช่องลงชื่อ 2 ช่อง (เว้นว่าง เส้นให้เซ็น): "ลงชื่อ ................... ฝ่ายบัญชีและการเงิน" / "ลงชื่อ ................... หัวหน้าฝ่ายบัญชีและการเงิน"

**Props:** `{ summary: DailyRevenueRow[]; dateFrom: string; dateTo: string }`

**หมายเหตุ:** ถ้าเลือกวิธีจ่าย = "เงินโอน" ยอดในสลิปจะเป็นยอดเฉพาะโอน (ตามตัวกรองที่เลือก) — ไม่บังคับเฉพาะเงินสด เพราะระบบไม่แยก slip ตามวิธีจ่ายในตัวอย่าง

---

## 7. Print CSS

ไม่ต้องแก้ไฟล์ print CSS ส่วนกลาง — ใช้กติกาเดิม (`report-toolbar` ซ่อนตอนพิมพ์, `report-letterhead` แสดงตอนพิมพ์). ตาราง/สลิปใหม่ใช้ class เดิม (`Table`, plain div) จึงพิมพ์ได้ทันทีตามกติกาเดิม

---

## 8. Testing

- Unit: ไม่มี logic คำนวณใหม่ (reuse `groupDailyRevenue`, `bahtText` เดิม) — ถ้าเพิ่ม flatten/sort helper ใน `ReceiptIssuanceView` ให้เขียน unit test แยกถ้า logic ซับซ้อนกว่า one-liner
- Manual: สลับ 3 selector ในเบราว์เซอร์ตรวจข้อมูลตรงกับตารางสรุป, ตรวจ print preview ทั้ง 3 แบบ (มีหัวกระดาษ, ซ่อน sidebar/toolbar), ตรวจกรณีไม่มีข้อมูลในช่วงที่เลือก (empty state)

---

## 9. Files

**ใหม่:**
- `src/components/finance/receipt-issuance-view.tsx`
- `src/components/finance/daily-remittance-slip.tsx`

**แก้:**
- `src/lib/queries/reports.ts` (`fetchDailyRevenue`: เพิ่ม `gradeClassroom`, `recordedByName`, พารามิเตอร์ `semesterId`)
- `src/components/finance/daily-revenue-panel.tsx` (selector รูปแบบเอกสาร + conditional render + ส่ง `semesterId` เข้า query)

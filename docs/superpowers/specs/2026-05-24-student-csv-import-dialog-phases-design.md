# Design Spec: Student CSV Import Dialog — Setup / Review Phases

**Date:** 2026-05-24  
**Status:** Approved (brainstorming)  
**Parent:** [2026-05-24-student-csv-import-design.md](./2026-05-24-student-csv-import-design.md)  
**Scope:** UX ของ `StudentImportDialog` เท่านั้น — ไม่เปลี่ยน server actions, validation, หรือรูปแบบ CSV

---

## 1. Overview

ปรับ dialog นำเข้า CSV ให้มีสองขั้นชัดเจน:

1. **`setup`** — แสดงรูปแบบไฟล์และเลือกไฟล์  
2. **`review`** — หลังเลือกไฟล์แล้ว แสดงผลตรวจสอบและยืนยันนำเข้า  

ผู้ใช้สามารถกด **ยกเลิก** ใน `review` เพื่อกลับ `setup` โดยไม่ปิด dialog

---

## 2. Decisions

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| ปุ่ม **ยกเลิก** | แสดงเฉพาะใน `review` |
| กด **ยกเลิก** | กลับ `setup` — dialog ยังเปิด; ล้างผล parse / error / file input |
| ปุ่ม **ปิด** | ปิด dialog ทั้ง `setup` และ `review` (reset state เมื่อปิด ตามเดิม) |
| หลังเลือกไฟล์ | ซ่อนตารางรูปแบบ, ดาวน์โหลดตัวอย่าง, เลือกไฟล์ CSV |
| เข้า `review` | เมื่อเริ่มอ่านไฟล์ (รวม `parsing`, `parseError`, หรือมีผล preview) |
| Preview รายการนำเข้า | แสดงครบทุกแถวที่พร้อมนำเข้า + คอลัมน์เลขประชาชน (ตาม implementation ปัจจุบัน) |
| Server / CSV logic | ไม่เปลี่ยน |

---

## 3. UI States

### 3.1 `setup` (เริ่มต้น)

**เนื้อหา**

- ตารางรูปแบบไฟล์ 3 คอลัมน์: คอลัมน์ (key) | คำอธิบาย | ตัวอย่าง (`CSV_FORMAT_TABLE`)
- ปุ่ม **ดาวน์โหลดไฟล์ตัวอย่าง**
- ปุ่ม **เลือกไฟล์ CSV** (+ `<input type="file">` ซ่อน)

**หัว dialog**

- Title: นำเข้านักเรียนจาก CSV  
- Description: อัปโหลดไฟล์ตามรูปแบบด้านล่าง ระบบจะตรวจสอบก่อนนำเข้า

**Footer**

| ปุ่ม | พฤติกรรม |
|------|----------|
| ปิด | ปิด dialog |

ไม่แสดง: ยกเลิก, ยืนยันนำเข้า

---

### 3.2 `review` (หลังเลือกไฟล์)

**เนื้อหา (ไม่แสดงส่วน setup)**

- ขณะ `parsing`: ข้อความ "กำลังตรวจสอบ..."
- หลังตรวจสอบ:
  - สรุป: พร้อมนำเข้า N แถว · ผิดพลาด M แถว (ถ้ามี)
  - ตารางข้อผิดพลาด (scroll) — ถ้ามี
  - ตารางรายการที่จะนำเข้า (scroll, ครบทุกแถว) — คอลัมน์: รหัส, เลขประชาชน, ชื่อ-นามสกุล, เพศ, วันเกิด
- ข้อความ `parseError` (client) — แสดงใน `review` เช่นกัน

**หัว dialog**

- Description: ตรวจสอบรายการก่อนยืนยันนำเข้า

**Footer** (ลำดับซ้าย → ขวา)

| ปุ่ม | พฤติกรรม |
|------|----------|
| ยกเลิก | กลับ `setup` — ล้าง `parsed`, `parseError`, `parsing`, ค่า file input |
| ปิด | ปิด dialog |
| ยืนยันนำเข้า | นำเข้าเมื่อ N > 0; disabled ถ้าไม่มีแถวพร้อมนำเข้าหรือกำลัง import |

---

## 4. State Machine

```
[เปิด dialog] → setup
setup → (เลือกไฟล์) → review
review → (ยกเลิก) → setup
setup | review → (ปิด dialog) → reset ทั้งหมด
review → (ยืนยันสำเร็จ) → ปิด dialog + refresh
```

**Implementation:** state `phase: 'setup' | 'review'`

- ตั้ง `phase = 'review'` เมื่อเริ่ม `handleFileChange` (ก่อนอ่านไฟล์เสร็จ)
- ตั้ง `phase = 'setup'` เมื่อกดยกเลิก หรือเมื่อ `open` กลายเป็น `false` (useEffect reset เดิม)

---

## 5. Component Changes

| ไฟล์ | การเปลี่ยนแปลง |
|------|----------------|
| `src/components/students/student-import-dialog.tsx` | `phase`, conditional render setup/review, ปุ่มยกเลิก + `handleCancel` |

**Out of scope**

- `csv-format.ts`, `csv-import.ts`, `actions/students.ts`
- ปุ่ม「นำเข้า CSV」บน `StudentsPanel`

---

## 6. Testing

**Manual**

1. เปิด dialog → เห็นตารางรูปแบบ + ดาวน์โหลด + เลือกไฟล์; footer มีแค่ **ปิด**
2. เลือกไฟล์ถูกต้อง → ซ่อนส่วน setup; เห็น preview + **ยกเลิก** | **ปิด** | **ยืนยัน**
3. กด **ยกเลิก** → กลับ setup; dialog ยังเปิด
4. เลือกไฟล์ผิดรูปแบบ → อยู่ `review` แสดง error; กดยกเลิก → เลือกไฟล์ใหม่ได้
5. กด **ปิด** จาก `review` → dialog ปิด; เปิดใหม่เริ่มที่ setup

---

## 7. Parent Spec Amendments

เมื่อ implement แล้ว อัปเดต §4 ใน [2026-05-24-student-csv-import-design.md](./2026-05-24-student-csv-import-design.md) ให้สอดคล้อง:

- แยกขั้น setup / review แทนการแสดงรูปแบบไฟล์ตลอด  
- Preview ครบทุกแถว + เลขประชาชน (ไม่จำกัด 10 แถว)  
- ปุ่มยกเลิกเฉพาะ `review`

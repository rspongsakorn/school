# Design Spec: ระบบรายงาน (v2)

**Date:** 2026-05-29
**Status:** Approved
**Parent:** [2026-05-24-finance-pages-design.md](./2026-05-24-finance-pages-design.md)
**Scope:** เติมเต็มระบบรายงานให้ครบตามความต้องการ 5 ข้อ — รายรับรายวัน, สรุปยอดประจำวัน, ลูกหนี้ตามรายชื่อ, ลูกหนี้ตามห้อง, สถิติ (ตามชั้น/ห้อง/รายบุคคล/ทั้งหมด)

---

## 1. Overview

ปัจจุบันมีรายงาน 2 หน้า: `รายงานค้างชำระ` (`/reports/outstanding`) และ `สรุปการเก็บ` (`/reports/collections`) งานนี้เพิ่ม 2 หน้าใหม่และขยาย 2 หน้าเดิม ให้ครบความต้องการ พร้อมความสามารถพิมพ์ PDF ทุกหน้า (หัวกระดาษทางการ)

| ข้อ | ความต้องการ | หน้า | สถานะ |
|-----|-------------|------|-------|
| 1 + 2 | รายรับรายวัน + สรุปยอดประจำวัน | `/reports/daily` | **ใหม่** |
| 3 | ลูกหนี้ค้างชำระตามรายชื่อ | `/reports/outstanding` | มีอยู่ |
| 4 | ลูกหนี้ตามห้อง | `/reports/outstanding` (โหมดจัดกลุ่ม) | **ขยาย** |
| 5 | สถิติ ตามชั้น/ห้อง/ทั้งหมด | `/reports/collections` | **ขยาย** |
| 5 | สถิติ รายบุคคล (ตาราง + statement) | `/reports/students`, `/reports/students/[studentId]` | **ใหม่** |

**Out of scope:** การส่งออกไฟล์ (Excel/CSV) — ใช้พิมพ์ PDF ผ่านเบราว์เซอร์แทน, กราฟ/ชาร์ต, การกำหนดช่วงวันข้ามปีการศึกษา, การ schedule ส่งรายงานอัตโนมัติ

---

## 2. Decisions (brainstorming)

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| แนวทาง | A — ต่อยอดหน้าเดิม + เพิ่ม 2 หน้าใหม่ ตามแพตเทิร์นปัจจุบัน (client component + react-query) |
| ขอบเขต | ครบทั้ง 5 ข้อในแผนเดียว |
| รายรับรายวัน | มีทั้งมุมมองสรุปรายวัน (1 แถว/วัน) และกางดูใบเสร็จรายวันได้ |
| สรุปยอดประจำวัน (ข้อ 2) | ไม่แยกหน้า — ฝังเป็นแถวยอดรวมท้ายตารางของหน้ารายรับรายวัน |
| รายบุคคล | ทำทั้งตารางสรุปรายคน และ statement รายคน |
| พิมพ์/ส่งออก | พิมพ์ PDF อย่างเดียว (browser print + print CSS) — ไม่มี export ไฟล์ Excel/CSV |
| หัวกระดาษ | ทุกหน้ารายงานมีหัวกระดาษทางการ (โลโก้ + ชื่อ/ที่อยู่โรงเรียน) แสดงเฉพาะตอนพิมพ์ |
| สิทธิ์ `รายรับรายวัน` | admin, finance เท่านั้น |
| สิทธิ์อีก 3 หน้า | admin, finance, teacher (ครูเห็นเฉพาะห้องที่รับผิดชอบ) |
| Void | นับเฉพาะ `status = active`; รายการ void แสดงแยกแต่ไม่รวมในยอด |
| Timezone | จัดกลุ่มตามวันอิงเขต Asia/Bangkok |

---

## 3. Cross-cutting (ใช้ร่วมกัน)

### 3.1 Print (PDF)

- **PDF:** ใช้ `window.print()` + print CSS — ผู้ใช้เลือก "Save as PDF" หรือพิมพ์ออกเครื่องพิมพ์ได้เอง ไม่ต้องลง dependency, ไม่มีการส่งออกไฟล์ Excel/CSV
- คอมโพเนนต์ `src/components/finance/report-toolbar.tsx` (`ReportToolbar`): ปุ่ม "พิมพ์" เรียก `window.print()` ใช้ซ้ำทุกหน้า

### 3.1.1 หัวกระดาษทางการ (`ReportLetterhead`)

- คอมโพเนนต์ `src/components/finance/report-letterhead.tsx`
- เนื้อหา: โลโก้ (`public/logo.png`), ชื่อโรงเรียน "โรงเรียนบัวใหญ่วิทยา", ที่อยู่ "อ.บัวใหญ่ จ.นครราชสีมา", ชื่อรายงาน, ปี/เทอม, ช่วงวันที่/ตัวกรองที่ใช้ (ถ้ามี), วันที่พิมพ์
- **แสดงเฉพาะตอนพิมพ์** (`hidden print:block`) — บนจอใช้ `AppHeader` เดิม
- วางบนสุดของทุกหน้ารายงาน (daily, outstanding, collections, students roster + statement)

### 3.2 Timezone helper

- เพิ่ม helper จัดกลุ่มตามวันในเขต Asia/Bangkok (เช่น `bangkokDateKey(iso): string` คืน `YYYY-MM-DD` ตามเวลาไทย) ไว้ใน `src/lib/format.ts` หรือ `src/lib/reports/`
- ใช้กับการ group payments ตามวัน เพื่อไม่ให้รายการช่วงดึกตกไปผิดวัน

### 3.3 Print CSS

- เพิ่ม print styles (global หรือ utility class) ซ่อน `aside` sidebar, `AppHeader`, และ `ReportToolbar` ตอน `@media print` และแสดง `ReportLetterhead`
- ตารางขยายเต็มหน้า; โหมดจัดกลุ่มตามห้อง (outstanding) ใส่ `break-before` ให้แต่ละห้องขึ้นหน้าใหม่

### 3.4 Navigation

- `src/components/app-sidebar.tsx` กลุ่ม "การเงิน" — รายการรายงานเป็น 4 รายการ:
  `รายรับรายวัน` (`/reports/daily`) · `รายงานค้างชำระ` (`/reports/outstanding`) · `สถิติการเก็บ` (`/reports/collections`) · `รายบุคคล` (`/reports/students`)
- `teacherNav` เพิ่ม `สถิติการเก็บ` และ `รายบุคคล` (ไม่รวม `รายรับรายวัน`)

### 3.5 Data layer

- Query ฝั่ง client อยู่ใน `src/lib/queries/reports.ts` (ตามแพตเทิร์นเดิม)
- ฟังก์ชัน server คู่ขนานใน `src/lib/data/reports.ts` (ถ้าจำเป็นต่อการใช้ฝั่ง server)

---

## 4. หน้า: รายรับรายวัน (`/reports/daily`) — ข้อ 1 + 2

**Role:** admin, finance

**ตัวกรอง:** ช่วงวันที่ (date-range, default = เดือนปัจจุบัน) + วิธีจ่าย (ทั้งหมด/เงินสด/โอน)

**Query:** `fetchDailyRevenue({ academicYearId, dateFrom, dateTo, method? })`
- ดึงจาก `payments` ตาม `academic_year_id` + ช่วง `paid_at` (รวม voided เพื่อแสดงแยก)
- จัดกลุ่มตามวัน (Bangkok TZ) ฝั่ง client; แยกผลรวม `payment_method` เป็นเงินสด/โอน
- นับยอดเฉพาะ `status = active`

**มุมมองหลัก — ตารางสรุปรายวัน:**

| วันที่ | จำนวนใบเสร็จ | เงินสด | เงินโอน | รวม |
|--------|------|-------|--------|-----|

- แถวท้าย = ยอดรวมทั้งช่วง (= "สรุปยอดประจำวัน" รวมทั้งช่วง)
- คลิกแถววัน → กางดูใบเสร็จของวันนั้น: เลขที่ใบเสร็จ, เวลา, ชื่อนักเรียน, วิธีจ่าย, ยอด
- รายการ void แสดงแยก (มีเครื่องหมายกำกับ) ไม่รวมในยอด

**มือถือ:** การ์ดต่อวัน แตะเพื่อกางใบเสร็จ

**Toolbar:** ปุ่มพิมพ์ + หัวกระดาษทางการตอนพิมพ์

---

## 5. หน้า: ลูกหนี้ค้างชำระ (`/reports/outstanding`) — ข้อ 3 + 4 (ขยาย)

**Role:** admin, finance, teacher (เดิม)

หน้านี้ทำข้อ 3 อยู่แล้ว เพิ่มเพื่อรองรับข้อ 4:

- เพิ่ม Select **มุมมอง:** `ตามรายชื่อ` (เดิม) / `จัดกลุ่มตามห้อง`
- โหมด "จัดกลุ่มตามห้อง": แสดงลูกหนี้คั่นหัวข้อด้วยห้อง (ป.1/1, ป.1/2, ...) แต่ละกลุ่มมียอดค้างรวมของห้อง
- ตัวกรองเดิม (ชั้น/ห้อง/สถานะ/ประเภทเบิกได้) คงไว้ทั้งหมด
- ใช้ query เดิม (`fetchOutstandingReport`) — grouping ทำตอน render จาก `gradeClassroom` ที่มีในแต่ละแถวอยู่แล้ว
- **ไม่แก้ logic ดึงข้อมูลเดิม**

**Toolbar:** ปุ่มพิมพ์ (print CSS ให้แต่ละห้องขึ้นหน้าใหม่) + หัวกระดาษทางการ

---

## 6. หน้า: สถิติการเก็บ (`/reports/collections`) — ข้อ 5 (ขยาย)

**Role:** admin, finance, teacher (เดิม)

เพิ่ม Select **ระดับ:** `ทั้งหมด` / `ตามชั้น` (เดิม) / `ตามห้อง`

- **ทั้งหมด** → การ์ดสรุปภาพรวม: นักเรียนทั้งหมด, ยอดต้องเก็บ, เก็บได้, ค้าง, อัตราเก็บได้ %
  - `fetchCollectionsSummary(semesterId, academicYearId, teacherProfileId?)`
- **ตามชั้น** → ตารางเดิม (`fetchCollectionsByGrade` — ไม่แก้)
- **ตามห้อง** → ตารางระดับห้อง (ป.1/1, ...): จำนวนนักเรียน, ต้องเก็บ, เก็บได้, อัตรา %
  - `fetchCollectionsByClassroom(semesterId, academicYearId, teacherProfileId?)`

ฟังก์ชันใหม่ใช้ logic รวมยอดเดิม เปลี่ยนแค่หน่วยจัดกลุ่ม

**Toolbar:** ปุ่มพิมพ์ + หัวกระดาษทางการ

---

## 7. หน้า: รายบุคคล (`/reports/students`) — ข้อ 5 (ใหม่)

**Role:** admin, finance, teacher (ครูเห็นเฉพาะห้องที่รับผิดชอบ)

### 7.1 ตารางสรุปรายคน (`/reports/students`)

**ตัวกรอง:** ชั้น/ห้อง + สถานะ + ค้นหาชื่อ/รหัส

| รหัส | ชื่อ-นามสกุล | ชั้น/ห้อง | ต้องชำระ | ชำระแล้ว | ค้าง | สถานะ |
|------|------|------|------|------|------|------|

- คลิกแถว → ไป statement รายคน
- `fetchStudentSummaryRoster({ semesterId, academicYearId, gradeLevelId?, classroomId?, status?, query?, teacherProfileId? })` — รวมยอด `student_invoices` ต่อนักเรียน

### 7.2 Statement รายคน (`/reports/students/[studentId]`)

- หัว: ชื่อ, รหัส, ชั้น/ห้อง, ปี/เทอม
- ตารางค่าใช้จ่าย (จาก `invoice_lines`): รายการ, จำนวนเงิน, ส่วนลด, รวมต้องชำระ
- ตารางประวัติการจ่าย (จาก `payments`): วันที่, เลขที่ใบเสร็จ, วิธีจ่าย, ยอด (รวม void ที่มีเครื่องหมายกำกับ)
- สรุปท้าย: รวมต้องชำระ / จ่ายแล้ว / คงค้าง
- `fetchStudentStatement(studentId, semesterId, academicYearId)`
- ครูที่เข้าถึง studentId นอกห้องตนเอง → ปฏิเสธ/redirect

**Toolbar:** ปุ่มพิมพ์ (เหมาะเป็นใบแจ้งยอดผู้ปกครอง พร้อมหัวกระดาษทางการ)

---

## 8. ไฟล์ที่เกี่ยวข้อง

**ใหม่:**
- `src/app/(dashboard)/reports/daily/page.tsx`
- `src/app/(dashboard)/reports/students/page.tsx`
- `src/app/(dashboard)/reports/students/[studentId]/page.tsx`
- `src/components/finance/daily-revenue-panel.tsx`
- `src/components/finance/student-roster-panel.tsx`
- `src/components/finance/student-statement-panel.tsx`
- `src/components/finance/report-toolbar.tsx` (ปุ่มพิมพ์)
- `src/components/finance/report-letterhead.tsx` (หัวกระดาษทางการตอนพิมพ์)

**แก้:**
- `src/lib/queries/reports.ts` (เพิ่ม fetch ใหม่: daily revenue, collections by classroom, collections summary, student roster, student statement)
- `src/lib/data/reports.ts` (คู่ขนานถ้าจำเป็น)
- `src/components/finance/outstanding-report-panel.tsx` (โหมดจัดกลุ่มตามห้อง + toolbar + letterhead)
- `src/components/finance/collections-report-panel.tsx` (Select ระดับ + toolbar + letterhead)
- `src/components/app-sidebar.tsx` (เมนู)
- `src/lib/format.ts` หรือ `src/lib/reports/` (Bangkok date helper)
- global CSS (print styles — ซ่อน sidebar/header/toolbar, แสดง letterhead)

---

## 9. Testing

- Unit: Bangkok date-key helper (รวมเคสช่วงดึกข้ามวัน)
- Unit: ฟังก์ชันจัดกลุ่ม daily revenue (แยกเงินสด/โอน, ตัด void ออกจากยอด)
- Manual: เดินผ่านแต่ละหน้าในเบราว์เซอร์ (golden path + พิมพ์ดู print preview ว่ามีหัวกระดาษและซ่อน sidebar/toolbar), ตรวจสิทธิ์ครู (เห็นเฉพาะห้องตน, ไม่เห็นรายรับรายวัน)

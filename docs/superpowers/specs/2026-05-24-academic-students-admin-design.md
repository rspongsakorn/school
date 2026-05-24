# Design Spec: จัดการปีการศึกษา ภาคเรียน และนักเรียน (Master)

**Date:** 2026-05-24  
**Status:** Approved  
**Parent:** [2026-05-24-tuition-management-design.md](./2026-05-24-tuition-management-design.md)  
**Scope:** v1 admin master-data pages — ไม่รวมลงทะเบียน (`student_enrollments`)

---

## 1. Overview

เพิ่มหน้าจัดการข้อมูลพื้นฐาน 3 ส่วนที่ยังเป็น placeholder ในแอป:

| หน้า | Route | สถานะปัจจุบัน |
|------|-------|---------------|
| ปีการศึกษา + ภาคเรียน | `/academic-year` | placeholder |
| นักเรียน (master) | `/students` | อ่านรายชื่อได้ ไม่มี CRUD |

**Out of scope รอบนี้:** ลงทะเบียน, ชั้น/ห้องเรียน, bulk import, header year/semester selector ที่ทำงานได้

---

## 2. Decisions (brainstorming)

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| ขอบเขต | ปีการศึกษา + ภาคเรียน + นักเรียน master — ไม่รวม enrollment |
| ปี/ภาค UI | หน้าเดียว `/academic-year` + wizard สร้างปีใหม่พร้อมภาค 1 และ 2 |
| นักเรียน CRUD | Sheet (overlay) — เพิ่มและแก้ไข |
| ลบนักเรียน | ลบถาวรได้เฉพาะเมื่อไม่มี enrollment/invoice; มีแล้วบังคับเปลี่ยนสถานะ |
| รายชื่อนักเรียน | ค้นหา + กรองสถานะ + pagination (50 แถว/หน้า) |
| Tech approach | Server Components + Server Actions + client islands (แนะนำและเลือกใช้) |

---

## 3. Database Reference

Schema ตรงกับ migration `20260524120000_initial_schema.sql` และ parent spec §3.

### `academic_years`

| Column | Notes |
|--------|-------|
| name | เช่น "2568" |
| start_date, end_date | date, end ≥ start |
| is_active | ปีที่ใช้งาน — มีได้เพียง 1 ปีที่ `is_active = true` (enforce ใน Server Action) |

### `semesters`

| Column | Notes |
|--------|-------|
| academic_year_id | FK |
| number | 1 หรือ 2 เท่านั้น |
| name | optional |
| start_date, end_date | date, end ≥ start |
| UNIQUE | (academic_year_id, number) |

### `students` (master)

| Column | Notes |
|--------|-------|
| student_code | UNIQUE, required |
| first_name, last_name | required |
| id_card | optional (เลขบัตรประชาชน) |
| status | enum: active, graduated, transferred, withdrawn |

### RLS

- **admin:** read/write ทั้ง 3 ตาราง
- **finance / teacher:** read `students` เท่านั้น (ตาม policy ที่มี)
- หน้า `/academic-year` — admin only (UI + action guard)

### Delete constraints

ลบ `students` ถาวร blocked โดย FK จาก `student_enrollments`, `student_invoices`, `payments` (ON DELETE RESTRICT). Server Action ตรวจก่อนลบและคืน error ที่เข้าใจได้

---

## 4. Architecture

### Pattern

```
Server Component (page)
  → lib/data/* (read, Supabase server client)
  → Client island (wizard, sheet, table controls)
      → lib/actions/* (mutate, revalidatePath)
```

### File layout

```
src/lib/auth/require-admin.ts
src/lib/data/academic-years.ts
src/lib/data/students.ts              # ขยาย listStudentsPaginated
src/lib/actions/academic-years.ts
src/lib/actions/students.ts
src/components/academic-year/
  year-table.tsx
  year-wizard-dialog.tsx
  year-edit-dialog.tsx
src/components/students/
  student-table.tsx                   # client: search, filter, pagination
  student-sheet.tsx
src/app/(dashboard)/academic-year/page.tsx
src/app/(dashboard)/students/page.tsx
```

### shadcn components to add

`dialog`, `sheet`, `form`, `input`, `label`, `alert-dialog`, `sonner`

---

## 5. Page: ปีการศึกษา (`/academic-year`)

### Access

- Admin only — non-admin redirect to `/`
- ไม่แสดง year/semester selector ใน header (master setup page)

### Main view

ตารางปีการศึกษาทั้งหมด เรียง `start_date` DESC:

| Column | Source |
|--------|--------|
| ชื่อปี | academic_years.name |
| วันที่ | start_date – end_date (รูปแบบไทย) |
| สถานะ | Badge "ใช้งาน" ถ้า is_active |
| จัดการ | ปุ่ม "แก้ไข" |

ปุ่มหลัก: **+ สร้างปีการศึกษาใหม่** → เปิด wizard

**Empty state:** ไม่มีปี → ข้อความ + CTA สร้างปีแรก

### Wizard สร้างปีใหม่ (Dialog, 3 ขั้น)

| Step | Fields | Defaults |
|------|--------|----------|
| 1. ปีการศึกษา | name*, start_date*, end_date*, checkbox "ตั้งเป็นปีที่ใช้งาน" | is_active = false |
| 2. ภาคเรียนที่ 1 | start_date*, end_date*, name (optional) | ครึ่งแรกของช่วงปี |
| 3. ภาคเรียนที่ 2 | start_date*, end_date*, name (optional) | ครึ่งหลังของช่วงปี |

Navigation: ถัดไป / ย้อนกลับ / ยืนยันสร้าง

**Server Action `createYearWithSemesters`:**

1. Validate dates (end ≥ start)
2. ถ้า is_active → UPDATE ปีอื่น SET is_active = false
3. INSERT academic_years
4. INSERT semesters number=1 และ number=2
5. revalidatePath('/academic-year')

### แก้ไขปีที่มีอยู่ (Dialog เดียว)

- แก้ year: name, dates, is_active
- แก้ semester 1 และ 2: dates, name (number read-only)
- Server Action `updateYearWithSemesters` — logic is_active เหมือนตอนสร้าง

### Validation rules

- name, dates required ทุก step
- semester dates นอกช่วงปี → แสดง warning สี amber แต่ไม่ block save
- ไม่รองรับภาคที่ 3 (schema constraint)

---

## 6. Page: นักเรียน (`/students`)

### Access

| Role | สิทธิ์ |
|------|--------|
| admin | อ่าน + เพิ่ม/แก้/ลบ |
| finance, teacher | อ่านอย่างเดียว (ซ่อนปุ่ม mutate) |

Header แสดง year/semester context ตามเดิม (จากปี active)

### Toolbar

- ช่องค้นหา: รหัส, ชื่อ, นามสกุล — debounce 300ms, server-side `ilike`
- Dropdown สถานะ: ทั้งหมด | กำลังศึกษา | จบการศึกษา | ย้ายออก | ลาออก
- ปุ่ม **+ เพิ่มนักเรียน** (admin)

**URL params:** `?q=`, `?status=all|active|graduated|transferred|withdrawn`, `?page=1`

### Table

| Column | Source |
|--------|--------|
| รหัส | student_code |
| ชื่อ-นามสกุล | first_name + last_name |
| เลขบัตร | id_card หรือ "—" |
| ชั้น | enrollment ปี active (เหมือนเดิม) หรือ "—" |
| สถานะ | Badge + ข้อความไทย |

- 50 แถว/หน้า, pagination ด้านล่าง
- คลิกแถว → เปิด Sheet แก้ไข (admin) หรือ Sheet read-only (non-admin)

### Sheet ฟิลด์

| Field | Required | Notes |
|-------|----------|-------|
| รหัสนักเรียน | yes | unique |
| ชื่อ | yes | |
| นามสกุล | yes | |
| เลขบัตรประชาชน | no | |
| สถานะ | yes | default active |

ปุ่ม: บันทึก | ลบ (admin, แสดงใน Sheet แก้ไขเท่านั้น)

### Delete flow

1. กด "ลบ" → AlertDialog ยืนยัน
2. Server Action ตรวจ COUNT จาก `student_enrollments`, `student_invoices`, `payments` WHERE student_id
3. count = 0 → DELETE student
4. count > 0 → error "ไม่สามารถลบได้ — มีประวัติการลงทะเบียนหรือใบแจ้งชำระ กรุณาเปลี่ยนสถานะแทน"

### Server Actions

| Action | Input |
|--------|-------|
| createStudent | form fields |
| updateStudent | id + form fields |
| deleteStudent | id |

ทุก action: ตรวจ admin role ก่อน mutate

---

## 7. Error Handling & UX

| Event | Response |
|-------|----------|
| student_code duplicate | toast error ภาษาไทย |
| save success | toast "บันทึกแล้ว" |
| delete blocked (FK) | toast + คง Sheet เปิด |
| non-admin /academic-year | redirect `/` |
| validation fail | inline field errors ใน form |

ใช้ `sonner` สำหรับ toast ตาม shadcn convention

---

## 8. Types

อัปเดต `src/lib/supabase/types.ts`:

- `semesters`: เพิ่ม start_date, end_date
- `students`: เพิ่ม id_card
- เพิ่ม enum types สำหรับ student_status (optional, ใช้ string union ก็ได้)

---

## 9. Testing (manual checklist)

- [ ] Admin สร้างปีใหม่ wizard → 2 semesters ใน DB
- [ ] ตั้ง is_active → ปีอื่น unset
- [ ] แก้ไขวันที่ภาคเรียน
- [ ] เพิ่มนักเรียน, แก้ไข, ค้นหา, กรองสถานะ, เปลี่ยนหน้า
- [ ] ลบนักเรียนใหม่ (ไม่มี FK) สำเร็จ
- [ ] ลบนักเรียนที่มี enrollment → error
- [ ] Finance/teacher อ่านได้ ไม่เห็นปุ่ม mutate
- [ ] Non-admin เข้า /academic-year → redirect

---

## 10. Future (out of scope)

- ลงทะเบียน `/registration`
- ชั้น/ห้อง `/grade-levels`, `/classrooms`
- Bulk import CSV
- Header year/semester selector ที่เปลี่ยน URL param ได้
- Copy ปีการศึกษา (duplicate year structure)

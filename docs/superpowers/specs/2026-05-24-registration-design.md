# Design Spec: ระบบลงทะเบียน (ชั้น ห้อง และ student_enrollments)

**Date:** 2026-05-24  
**Status:** Approved  
**Parent:** [2026-05-24-tuition-management-design.md](./2026-05-24-tuition-management-design.md)  
**Depends on:** [2026-05-24-academic-students-admin-design.md](./2026-05-24-academic-students-admin-design.md) (ปีการศึกษา + นักเรียน master — implemented)  
**Scope:** v1 admin pages — ชั้นเรียน, ห้องเรียน, ลงทะเบียนนักเรียนตามห้อง, ย้ายห้อง, เปลี่ยนสถานะ enrollment

---

## 1. Overview

แทนที่ placeholder ที่ `/registration` ด้วยระบบลงทะเบียนตาม parent spec workflow §4.1 ขั้นตอน 2–3:

1. กำหนดชั้นเรียนและห้องเรียนต่อปีการศึกษา
2. ลงทะเบียนนักเรียนเข้าห้องเรียน

| หน้า | Route | หน้าที่ |
|------|-------|--------|
| ตั้งค่าชั้น/ห้อง | `/registration/setup` | CRUD `grade_levels`, `classrooms` |
| ลงทะเบียน | `/registration` | จัดการ `student_enrollments` แบบเริ่มจากห้อง |

**Out of scope รอบนี้:** bulk import CSV, `teacher_assignments`, header year/semester selector ทั้งแอป, ลบ enrollment ถาวร

---

## 2. Decisions (brainstorming)

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| ขอบเขต | ชั้น + ห้อง + ลงทะเบียน + ย้ายห้อง + เปลี่ยนสถานะ enrollment |
| โครงหน้า | แยก route: `/registration/setup` และ `/registration` — sidebar กลุ่มเดียวกัน |
| UX ลงทะเบียน | เริ่มจากชั้น → ห้อง → รายชื่อในห้อง (classroom-centric) |
| ปีการศึกษา | ปี `is_active` เป็นค่าเริ่มต้น, เลือกปีอื่นได้ (dropdown + `?year=`) |
| ย้ายห้อง | อัปเดต `classroom_id` คง `status = enrolled` |
| เปลี่ยนสถานะ | แยกปุ่ม → `transferred` หรือ `withdrawn`; ไม่แสดงในรายชื่อห้องปกติ |
| กลับมาเรียน | ตั้งกลับ `enrolled` + เลือกห้องในแถว enrollment เดิม (1 แถวต่อนักเรียนต่อปี) |
| Tech approach | Server Components + Server Actions + client islands (ตาม pattern ที่มี) |

---

## 3. Database Reference

Schema มีอยู่แล้วใน `20260524120000_initial_schema.sql` — ไม่ต้อง migration ใหม่สำหรับ v1 นี้

### `grade_levels`

| Column | Notes |
|--------|-------|
| academic_year_id | FK |
| name | เช่น "ป.1", "ม.1" |
| sort_order | int, default 0 |
| UNIQUE | (academic_year_id, name) |

### `classrooms`

| Column | Notes |
|--------|-------|
| academic_year_id | FK |
| grade_level_id | FK |
| name | เช่น "1/1" |
| UNIQUE | (academic_year_id, grade_level_id, name) |

### `student_enrollments`

| Column | Notes |
|--------|-------|
| student_id | FK |
| classroom_id | FK |
| academic_year_id | FK (denormalized) |
| status | `enrolled`, `transferred`, `withdrawn` |
| UNIQUE | (student_id, academic_year_id) — **นักเรียน 1 คนต่อปีมีได้ 1 แถว** |

### RLS (มีอยู่แล้ว)

| ตาราง | admin | finance | teacher |
|-------|-------|---------|---------|
| grade_levels, classrooms | read/write | read | read |
| student_enrollments | read/write | read | read (ห้องที่มอบหมาย) |

### Delete constraints

- ลบชั้น/ห้อง: blocked ถ้ามี `student_enrollments` อ้างอิง (ON DELETE RESTRICT)
- Server Action ตรวจและคืน error ภาษาไทย

---

## 4. Architecture

### Pattern

```
Server Component (page)
  → lib/data/* (read)
  → Client island (year select, panels, dialogs)
      → lib/actions/* (mutate, revalidatePath)
```

### File layout

```
src/lib/data/
  grade-levels.ts
  classrooms.ts
  enrollments.ts              # ขยาย: roster, counts, unenrolled

src/lib/actions/
  grade-levels.ts
  classrooms.ts
  enrollments.ts

src/lib/enrollment/
  constants.ts                # status labels (Thai)
  validation.ts               # pure helpers + tests

src/components/registration/
  year-select.tsx
  setup-panel.tsx
  registration-panel.tsx
  enroll-student-dialog.tsx
  move-classroom-dialog.tsx
  enrollment-status-dialog.tsx

src/app/(dashboard)/registration/
  page.tsx
  setup/page.tsx
```

### Sidebar

กลุ่ม **ลงทะเบียน** (แทนลิงก์เดียว):

- ตั้งค่าชั้น/ห้อง → `/registration/setup`
- ลงทะเบียนนักเรียน → `/registration`

---

## 5. Page: ตั้งค่าชั้น/ห้อง (`/registration/setup`)

### Access

- **Admin:** CRUD
- **Finance / Teacher:** อ่านอย่างเดียว (ซ่อนปุ่ม mutate)

### Year selector

- Dropdown รายการ `academic_years` เรียง `start_date` DESC
- ค่าเริ่มต้น: ปี `is_active` หรือปีล่าสุดถ้าไม่มี active
- URL: `?year=<uuid>`

### Layout (master-detail)

**ซ้าย — ชั้นเรียน**

- รายการ `grade_levels` ของปีที่เลือก เรียง `sort_order`, `name`
- ปุ่ม **+ เพิ่มชั้น** → Dialog (name*, sort_order)
- แถวละชั้น: แก้ไข | ลบ

**ขวา — ห้องเรียน** (ของชั้นที่เลือก)

- รายการ `classrooms`
- ปุ่ม **+ เพิ่มห้อง** → Dialog (name*)
- แถวละห้อง: แก้ไข | ลบ

### Empty states

- ยังไม่มีชั้น → ข้อความ + CTA เพิ่มชั้น
- ยังไม่เลือกชั้น → ข้อความให้เลือกชั้นทางซ้าย

### Server Actions

| Action | Notes |
|--------|-------|
| createGradeLevel | yearId, name, sortOrder |
| updateGradeLevel | id, name, sortOrder |
| deleteGradeLevel | id — fail ถ้ามี classrooms หรือ enrollments |
| createClassroom | yearId, gradeLevelId, name |
| updateClassroom | id, name |
| deleteClassroom | id — fail ถ้ามี enrollments |

---

## 6. Page: ลงทะเบียน (`/registration`)

### Access

- **Admin:** enroll, move, status change
- **Finance / Teacher:** อ่านอย่างเดียว

### Year selector

เหมือนหน้า setup — ใช้ component ร่วม (`year-select.tsx`)

### URL params

`?year=<uuid>&grade=<uuid>&classroom=<uuid>` — จำ selection หลัง refresh

### Layout (3 คอลัมน์ desktop, stack mobile)

1. **ชั้นเรียน** — รายการ grade ของปี
2. **ห้องเรียน** — ห้องในชั้นที่เลือก + badge จำนวน `enrolled`
3. **รายชื่อในห้อง** — เฉพาะ `student_enrollments.status = enrolled`

### Roster table

| Column | Source |
|--------|--------|
| รหัส | students.student_code |
| ชื่อ-นามสกุล | first_name + last_name |
| สถานะ enrollment | badge ไทย |
| จัดการ | ย้ายห้อง, เปลี่ยนสถานะ (admin) |

### Actions (admin)

**+ เพิ่มนักเรียนในห้อง** (Dialog)

- ค้นหารหัส/ชื่อ — debounce 300ms
- แสดงนักเรียน `students.status = active` ที่:
  - ยังไม่มี enrollment ในปีนี้ หรือ
  - มี enrollment แต่ `status != enrolled` (สำหรับกลับมาเรียน)
- บันทึก → `enrollStudent(studentId, classroomId, yearId)`

**ย้ายห้อง** (Dialog)

- เลือกห้องใหม่ — dropdown ทุกห้องในปี จัดกลุ่มตามชั้น
- บันทึก → `moveStudentClassroom(enrollmentId, newClassroomId)`

**เปลี่ยนสถานะ** (Dialog)

- เลือก `transferred` หรือ `withdrawn`
- บันทึก → `updateEnrollmentStatus(enrollmentId, status)`
- หลังบันทึก: หายจาก roster (กรองเฉพาะ enrolled)

**กลับมาเรียน**

- ผ่าน Dialog เพิ่มนักเรียน (upsert แถวเดิม → `enrolled` + ห้องที่เลือก)

### Secondary: นักเรียนไม่อยู่ในห้อง

- ลิงก์/แท็บย่อย **"ไม่อยู่ในห้อง"** ใน panel — แสดง enrollment ในปีที่ `status != enrolled` (optional v1: รวมใน Dialog เพิ่มนักเรียนก็เพียงพอ)

### Empty states

- ยังไม่มีชั้น/ห้อง → ลิงก์ไป `/registration/setup`
- ห้องว่าง → ข้อความ + ปุ่มเพิ่มนักเรียน

### Server Actions

| Action | Behavior |
|--------|----------|
| enrollStudent | INSERT หรือ UPDATE แถว (student_id, year_id) → enrolled + classroom_id + academic_year_id จากห้อง |
| moveStudentClassroom | UPDATE classroom_id, คง enrolled |
| updateEnrollmentStatus | UPDATE status → transferred \| withdrawn |
| reEnrollStudent | alias ของ enrollStudent (enrolled + classroom) |

ทุก action: `requireAdminAction()` ก่อน mutate; `revalidatePath('/registration')` และ `/students`

---

## 7. Enrollment business rules

1. นักเรียน 1 คนต่อปีการศึกษา → สูงสุด 1 แถว `student_enrollments`
2. ย้ายห้อง = แก้ `classroom_id` ไม่สร้างแถวใหม่
3. Roster ห้องแสดงเฉพาะ `enrolled`
4. `academic_year_id` ใน enrollment ต้องตรงกับ `classrooms.academic_year_id`
5. เสนอเฉพาะ `students.status = active` ใน Dialog เพิ่ม (ยกเว้น re-enroll จากแถวเดิม)

---

## 8. Error Handling & UX

| Event | Response |
|-------|----------|
| ลงทะเบียนซ้ำ (unique student+year) | toast: "นักเรียนลงทะเบียนในปีนี้แล้ว" |
| ลบชั้น/ห้องที่มี enrollment | toast: "ไม่สามารถลบได้ — มีนักเรียนลงทะเบียนอยู่" |
| validation ชื่อว่าง | inline field errors ใน Dialog |
| save success | toast ภาษาไทย |
| non-admin | ซ่อนปุ่ม mutate |

ใช้ `sonner` + `FieldError` ตาม convention ที่มี

---

## 9. Impact on existing pages

| หน้า | ผล |
|------|-----|
| `/students` | คอลัมน์ "ชั้น" แสดงเมื่อมี enrollment `enrolled` ในปี active |
| Dashboard stats | นับนักเรียนที่ลงทะเบียนในปี active ได้ถูกต้องขึ้น |

---

## 10. Testing

### Vitest

- `validation.ts`: ชื่อชั้น/ห้องว่าง, สถานะ enrollment ที่อนุญาต

### Manual checklist

- [ ] สร้างชั้น + ห้องในปี 2568
- [ ] เลือกปีจาก dropdown (ไม่ใช่แค่ active)
- [ ] เพิ่มนักเรียนเข้าห้อง → แสดงใน roster
- [ ] ย้ายห้อง → roster ห้องใหม่, หายจากห้องเก่า
- [ ] เปลี่ยนสถานะ withdrawn → หายจาก roster
- [ ] กลับมาเรียน (enrolled + ห้อง) → กลับเข้า roster
- [ ] ลบห้องที่มีนักเรียน → error
- [ ] Finance อ่านได้ ไม่เห็นปุ่มแก้ไข
- [ ] คอลัมน์ชั้นใน `/students` อัปเดตหลังลงทะเบียน

---

## 11. Future (out of scope)

- Bulk import ลงทะเบียน
- มอบหมายครู (`teacher_assignments`)
- Header year/semester selector sync กับ `?year=`
- Copy โครงสร้างชั้น/ห้องจากปีก่อน
- ลบ enrollment ถาวร (admin)

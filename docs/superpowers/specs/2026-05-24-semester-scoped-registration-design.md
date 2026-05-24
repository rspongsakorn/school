# Design Spec: ข้อมูลชั้น/ห้อง/ลงทะเบียนตามภาคเรียน (Semester-Scoped)

**Date:** 2026-05-24  
**Status:** Approved (brainstorming)  
**Parent:** [2026-05-24-tuition-management-design.md](./2026-05-24-tuition-management-design.md)  
**Supersedes (partial):** [2026-05-24-registration-design.md](./2026-05-24-registration-design.md) — เปลี่ยนจากปีการศึกษาเป็นภาคเรียนเป็นหลัก  
**Depends on:** [2026-05-24-academic-students-admin-design.md](./2026-05-24-academic-students-admin-design.md)

---

## 1. Overview

เปลี่ยนโมเดลข้อมูลและ UI จาก **ปีการศึกษา** เป็น **ภาคเรียน** เป็นหน่วยหลักสำหรับ:

- ชั้นเรียน (`grade_levels`)
- ห้องเรียน (`classrooms`)
- การลงทะเบียนนักเรียน (`student_enrollments`)
- การมอบหมายครู (`teacher_assignments`)
- อัตราค่าเทอม (`fee_rates` — สอดคล้อง `grade_level` ต่อภาค)

ผลลัพธ์: ภาคเรียนที่ 1 และ 2 ของปีเดียวกันมีชั้น/ห้อง/รายชื่อแยกกัน นักเรียนอาจอยู่คนละห้องในแต่ละภาคได้

### Decisions (brainstorming)

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| ขอบเขตข้อมูล | แยกตามภาคเรียนจริง (ไม่ใช่แค่ UI) |
| ขอบเขตระบบ | ลงทะเบียน, นักเรียน, Dashboard, fee rates, teacher assignments |
| Migration ข้อมูลเดิม | ย้ายทั้งหมดไป **ภาคเรียนที่ 1** ของแต่ละปี; ภาค 2 เริ่มว่าง |
| ภาค 2 | ปุ่ม **คัดลอกโครงสร้างจากภาค 1** (ชั้น + ห้อง, ไม่รวมนักเรียน/ครู) |
| แนวทางเทคนิค | เพิ่ม `semester_id` เป็นตัวหลัก + คง `academic_year_id` denormalized |

### Out of scope รอบนี้

- คัดลอกนักเรียนไปภาค 2 อัตโนมัติ
- Bulk import ลงทะเบียน
- ภาคเรียนที่ 3 ขึ้นไป
- คัดลอกโครงสร้างข้ามปีการศึกษา

---

## 2. Schema changes

Migration ใหม่: `supabase/migrations/YYYYMMDDHHMMSS_semester_scoped_grades_enrollments.sql`

### `grade_levels`

| Change | Detail |
|--------|--------|
| Add | `semester_id uuid NOT NULL REFERENCES semesters(id)` |
| UNIQUE | `(semester_id, name)` แทน `(academic_year_id, name)` |
| Keep | `academic_year_id` — denormalized, sync จาก `semesters.academic_year_id` |

### `classrooms`

| Change | Detail |
|--------|--------|
| Add | `semester_id uuid NOT NULL REFERENCES semesters(id)` |
| UNIQUE | `(semester_id, grade_level_id, name)` แทน `(academic_year_id, grade_level_id, name)` |
| Keep | `academic_year_id` denormalized |

### `student_enrollments`

| Change | Detail |
|--------|--------|
| Add | `semester_id uuid NOT NULL REFERENCES semesters(id)` |
| UNIQUE | `(student_id, semester_id)` แทน `(student_id, academic_year_id)` |
| Keep | `academic_year_id` denormalized |
| Rule | นักเรียน 1 คนต่อ **ภาคเรียน** มีได้ 1 แถว |

### `teacher_assignments`

| Change | Detail |
|--------|--------|
| Add | `semester_id uuid NOT NULL REFERENCES semesters(id)` |
| UNIQUE | `(profile_id, classroom_id, semester_id)` แทนรวม `academic_year_id` |
| Keep | `academic_year_id` denormalized |

### `fee_rates`

ไม่เปลี่ยนโครงสร้างตาราง (มี `semester_id` + `grade_level_id` อยู่แล้ว)

- หลัง migration: `grade_level_id` ต้องอยู่ในภาคเดียวกับ `semester_id` ของแถว fee_rate
- ตรวจใน Server Action ก่อน insert/update

---

## 3. Data migration

ลำดับใน migration script:

1. `ALTER TABLE` เพิ่ม `semester_id` (nullable ชั่วคราว) ให้ `grade_levels`, `classrooms`, `student_enrollments`, `teacher_assignments`
2. สำหรับแต่ละ `academic_year`:
   - หา `semesters` ที่ `number = 1`
   - `UPDATE grade_levels SET semester_id = <sem1>` WHERE `academic_year_id = year.id`
   - `UPDATE classrooms SET semester_id = <sem1>` จากห้องที่ผูก grade ของปีนั้น
   - `UPDATE student_enrollments SET semester_id = <sem1>` จาก `classrooms.semester_id`
   - `UPDATE teacher_assignments SET semester_id = <sem1>` จาก `classrooms.semester_id`
3. `ALTER COLUMN semester_id SET NOT NULL`
4. ลบ UNIQUE เก่า, สร้าง UNIQUE ใหม่ตาม §2
5. **fee_rates ภาค 2:** แถวที่ `semester_id` ชี้ภาค 2 แต่ `grade_level_id` เป็นของภาค 1 — ไม่ auto-fix; admin ตั้ง fee ใหม่หลัง copy โครงสร้างภาค 2 (หรือลบแถว orphan ใน dev ถ้าไม่มีข้อมูลจริง)

---

## 4. App-wide semester context

ตาม parent spec §2 Architecture:

### URL params

```
?year=<academic_year_uuid>&semester=1|2
```

- `year` — ปีการศึกษา
- `semester` — หมายเลขภาค (1 หรือ 2)

### Cookie fallback

- เก็บ `last_year_id`, `last_semester_number` สำหรับเข้า path ที่ไม่มี query
- อัปเดตเมื่อผู้ใช้เปลี่ยนใน header

### Helpers (`src/lib/enrollment/` หรือ `src/lib/context/`)

```typescript
type SemesterContext = {
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  semesterNumber: 1 | 2;
};

function resolveSemesterContext(
  yearParam: string | undefined,
  semesterParam: string | undefined,
  years: AcademicYearOption[],
  semesters: SemesterOption[], // flat หรือ grouped by year
): SemesterContext | null;
```

- ค่าเริ่มต้น: ปี `is_active` + ภาค `1`
- ถ้า `semester` ไม่ valid → ภาค 1 ของปีที่เลือก

### Header (`AppHeader`)

- เปิดใช้ `showContextSelectors={true}` บนหน้าที่ต้องการ context
- Dropdown ปี + ภาค ทำงานจริง (ไม่ disabled)
- เปลี่ยนค่า → อัปเดต URL + cookie + `router.refresh()`

### หน้าที่ไม่ใช้ context

- `/academic-year` — จัดการปี/ภาคเอง
- `/login`

---

## 5. Registration page (`/registration`)

### Selector

แทน `YearSelect` ด้วย **ปี + ภาค** (สอง dropdown) หรือรายการรวม "2568 ภาค 1" — ใช้สอง dropdown ให้สอดคล้อง header

- Label: ปีการศึกษา + ภาคเรียน
- Base UI Select ใช้ `items` prop (แก้ปัญหาแสดง label ผิด)

### Data loading

```typescript
const ctx = resolveSemesterContext(sp.year, sp.semester, years, semesters);
const grades = await listGradeLevels(ctx.semesterId);
// grade, classroom URL params ยังใช้ uuid
const roster = await listClassroomRoster(classroomId);
```

### URL params

```
?year=<uuid>&semester=1|2&grade=<uuid>&classroom=<uuid>
```

- เปลี่ยนปีหรือภาค → ล้าง `grade`, `classroom`

### Copy structure (ภาค 2)

- แสดงเมื่อ: `semesterNumber === 2` และ `grades.length === 0` และ admin
- ปุ่ม: **คัดลอกโครงสร้างจากภาค 1**
- Action: `copySemesterStructure(targetSemesterId)`:
  - หา semester 1 ของปีเดียวกัน
  - Copy `grade_levels` (name, sort_order) → สร้างใหม่ใน target
  - Copy `classrooms` (name) ต่อ grade ที่ map id ใหม่
  - ไม่ copy `student_enrollments`, `teacher_assignments`
  - ถ้า target มีชั้นอยู่แล้ว → error หรือ skip ชื่อซ้ำ (เลือก: **error ถ้ามีชั้นแล้ว**)

### Business rules (อัปเดตจาก registration spec)

| กฎเดิม (ต่อปี) | กฎใหม่ (ต่อภาค) |
|---------------|----------------|
| 1 แถว enrollment ต่อนักเรียนต่อปี | 1 แถวต่อนักเรียนต่อ **ภาค** |
| ลงทะเบียนซ้ำในปี | ลงทะเบียนซ้ำใน **ภาค** — toast: "นักเรียนลงทะเบียนในภาคนี้แล้ว" |
| ย้ายห้อง | ภายในภาคเดียวกัน (classroom.semester_id ต้องตรง) |
| Roster | เฉพาะ `status = enrolled` |
| ลบห้อง | มี enrollment ใดๆ → ห้าม |
| ลบชั้น | มีห้อง หรือมี enrollment ในห้องของชั้น → ห้าม |

### UI ที่มีอยู่ (คงไว้)

- 3 คอลัมน์: ชั้น → ห้อง → roster
- ปุ่ม + เพิ่ม / แก้ไข / ลบ ชั้นและห้อง
- Dialog ลงทะเบียน / ย้ายห้อง / เปลี่ยนสถานะ

---

## 6. Other pages & modules

| Module | Change |
|--------|--------|
| `getStudentGradeMap` | รับ `semesterId` แทน `academicYearId` |
| `/students` | ใช้ semester จาก context; คอลัมน์ชั้นตามภาคที่เลือก |
| Dashboard | นับ enrollment / stats ตาม `semesterId` |
| `grade-levels` / `classrooms` actions | รับ `semesterId`; insert ตั้ง `academic_year_id` จาก semester |
| `enrollments` actions | UNIQUE ต่อ semester; validate classroom ในภาคเดียวกัน |
| `fee_rates` (ปัจจุบัน/อนาคต) | เลือกได้เฉพาะ `grade_levels` ของ `semester_id` ที่เลือก |
| `teacher_assignments` | filter/create ตาม `semester_id` |
| RLS | ทบทวน policies ที่อ้างเฉพาะ `academic_year_id` — เพิ่ม join ผ่าน semester ถ้าจำเป็น |

---

## 7. File layout (implementation)

```
supabase/migrations/
  YYYYMMDDHHMMSS_semester_scoped_grades_enrollments.sql

src/lib/context/
  semester-params.ts          # resolveSemesterContext, tests
  semester-cookie.ts          # read/write cookie (optional)

src/lib/data/
  semesters.ts                # listSemesterOptions, getSemesterByYearAndNumber
  grade-levels.ts             # filter by semester_id
  classrooms.ts               # filter by semester_id
  enrollments.ts              # filter by semester_id

src/lib/actions/
  semester-structure.ts       # copySemesterStructure
  grade-levels.ts             # semesterId on create
  classrooms.ts
  enrollments.ts

src/components/
  context/year-semester-select.tsx   # header + registration
  registration/registration-panel.tsx  # semester selector, copy button

src/components/app-header.tsx     # working selectors
```

---

## 8. Error handling

| Event | Response |
|-------|----------|
| ลงทะเบียนซ้ำในภาค | toast: "นักเรียนลงทะเบียนในภาคนี้แล้ว" |
| ย้ายห้องข้ามภาค | toast: "ห้องเรียนต้องอยู่ในภาคเรียนเดียวกัน" |
| ลบห้องที่มีนักเรียน | toast: "ไม่สามารถลบได้ — มีนักเรียนลงทะเบียนอยู่" |
| ลบชั้นที่มีห้อง/enrollment | toast ภาษาไทยตามเดิม |
| Copy เมื่อภาค 2 มีชั้นแล้ว | toast: "ภาคเรียนนี้มีชั้นเรียนอยู่แล้ว" |
| fee_rate grade ข้ามภาค | toast: "ชั้นเรียนไม่ตรงกับภาคเรียน" |

---

## 9. Testing

### Vitest

- `resolveSemesterContext` — default active year + sem 1, valid/invalid params
- `copySemesterStructure` validation (ถ้าแยก pure helper)

### Manual checklist

- [ ] Migration รันบน dev — ข้อมูลเดิมอยู่ภาค 1
- [ ] ภาค 1 และ 2 ชั้น/ห้องแยกกัน
- [ ] นักเรียนลงทะเบียนภาค 1 และภาค 2 คนละห้องได้
- [ ] Header เปลี่ยนปี/ภาค → students + registration อัปเดต
- [ ] คัดลอกโครงสร้างภาค 1 → ภาค 2
- [ ] ลบห้อง/ชั้นที่มีนักเรียน → error
- [ ] URL `?year=&semester=` share ได้

---

## 10. Relationship to prior specs

| เอกสาร | ผลกระทบ |
|--------|---------|
| `2026-05-24-registration-design.md` | §ปีการศึกษา, UNIQUE ต่อปี — **แทนที่**ด้วย spec นี้ |
| `2026-05-24-tuition-management-design.md` | §year-semester context — **implement ตามนี้** |
| `2026-05-24-academic-students-admin-design.md` | นักเรียน master ไม่เปลี่ยน; คอลัมน์ชั้นใช้ semester context |

---

## 11. Implementation order (suggested)

1. Migration + types
2. `resolveSemesterContext` + semester data helpers
3. Refactor data/actions ให้ใช้ `semesterId`
4. Header selectors (year + semester)
5. Registration UI + copy structure
6. Students + Dashboard
7. fee_rates / teacher_assignments validation
8. Manual + Vitest verification

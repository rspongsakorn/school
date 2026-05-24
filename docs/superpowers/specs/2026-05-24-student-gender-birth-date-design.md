# Design Spec: เพศและวันเกิดนักเรียน (พ.ศ.)

**Date:** 2026-05-24  
**Status:** Approved (brainstorming)  
**Parent:** [2026-05-24-academic-students-admin-design.md](./2026-05-24-academic-students-admin-design.md)  
**Scope:** ฟิลด์ `gender` + `date_of_birth` บนฟอร์มเพิ่ม/แก้ไขนักเรียน (`/students`) — ไม่ขยายไปตารางรายชื่อ ใบเสร็จ หรือหน้าการเงิน

---

## 1. Overview

ขยายข้อมูล master นักเรียนด้วย:

| ฟิลด์ | ค่า | แสดงใน UI |
|--------|-----|-----------|
| เพศ | ชาย (`male`) / หญิง (`female`) | ฟอร์ม `StudentSheet` เท่านั้น |
| วันเกิด | `date` (ISO) | Date picker แสดงปี **พ.ศ.** |

การแสดงชื่อในตาราง ใบเสร็จ และหน้าอื่นยังใช้ `formatStudentName(first, last)` แบบเดิม — **ไม่** ต่อท้ายเพศหรือคำนำหน้า

---

## 2. Decisions (brainstorming)

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| คำนำหน้า 4 แบบ | **ยกเลิก** — เก็บเป็นเพศ ชาย/หญิง แทน |
| วันเกิด | Date picker แสดงปี พ.ศ. (ไม่ใช่ 3 dropdown) |
| บังคับกรอก | **นักเรียนใหม่** ต้องมีทั้งเพศและวันเกิด |
| ข้อมูลเก่า | Nullable ใน DB — แก้ไขทีหลังได้ ไม่บังคับ backfill |
| แสดงเพศ/วันเกิด | เฉพาะฟอร์มเพิ่ม/แก้ไข (ไม่เพิ่มคอลัมน์ตาราง `/students`) |
| เก็บวันเกิด | คอลัมน์ `date` ค.ศ. ใน PostgreSQL; แปลง พ.ศ. ที่ชั้น UI เท่านั้น |
| แนวทางเทคนิค | Migration enum + `date` + shadcn Calendar/Popover + validation ตามโหมด create/update |

---

## 3. Database

### Migration (ใหม่)

```sql
CREATE TYPE public.student_gender AS ENUM ('male', 'female');

ALTER TABLE public.students
  ADD COLUMN gender public.student_gender,
  ADD COLUMN date_of_birth date;
```

- ทั้งสองคอลัมน์ **nullable** — รองรับแถวที่มีอยู่ก่อน deploy
- ไม่ backfill อัตโนมัติ
- RLS: ไม่เปลี่ยน — admin write, finance/teacher read ตามเดิม

### ตาราง `students` หลัง migration

| Column | Type | Notes |
|--------|------|-------|
| `gender` | `student_gender` | nullable; `male` / `female` |
| `date_of_birth` | `date` | nullable; ไม่ใช้ `timestamptz` เพื่อหลีกเลี่ยง timezone เลื่อนวัน |

---

## 4. Validation Rules

ฟังก์ชัน `validateStudentForm(input, options)` รับ `mode: 'create' | 'update'` และ `existing?: { gender, dateOfBirth }` (ค่าใน DB ก่อนแก้)

| โหมด | เพศ | วันเกิด |
|------|-----|---------|
| `create` | บังคับ | บังคับ |
| `update` — ทั้งคู่ใน DB ยัง `null` | ไม่บังคับ | ไม่บังคับ |
| `update` — มีค่าใน DB อย่างน้อยหนึ่งฟิลด์ | ห้ามลบเป็นค่าว่าง | ห้ามลบเป็นค่าว่าง |

ข้อความ error (ภาษาไทย):

- `กรุณาเลือกเพศ`
- `กรุณาเลือกวันเกิด`
- `วันเกิดต้องไม่เป็นวันในอนาคต` (ถ้าเลือกวันหลังวันนี้)

**ไม่ validate** อายุสูงสุด/ต่ำสุดตามระดับชั้นในรอบนี้ (YAGNI)

---

## 5. Date Handling (พ.ศ.)

ไฟล์ใหม่ `src/lib/students/dates.ts`:

| ฟังก์ชัน | หน้าที่ |
|---------|--------|
| `toBuddhistYear(ceYear: number)` | `ceYear + 543` |
| `formatThaiBirthDate(isoDate: string)` | แสดงใน trigger ปุ่ม picker เช่น `15 พ.ค. 2550` |
| `isoDateFromParts` / parse helpers | แปลง `Date` ↔ `YYYY-MM-DD` โดยใช้ local date components |

หลักการ:

- Server/API รับ-ส่ง **`YYYY-MM-DD`** เท่านั้น
- ปฏิทิน (react-day-picker): หัวปฏิทินและปุ่ม trigger แสดงปี พ.ศ.
- ห้ามใช้ `toISOString().slice(0,10)` สำหรับวันเกิด (เสี่ยงเลื่อนวัน)

---

## 6. UI — `StudentSheet`

เพิ่มใน Dialog เดิม (`src/components/students/student-sheet.tsx`):

1. **เพศ** — `Select` รายการ `ชาย` / `หญิง` (`items` prop ตาม convention โปรเจกต์)
2. **วันเกิด** — `Popover` + `Calendar` (shadcn/ui components ใหม่)

พฤติกรรม:

- **เพิ่มนักเรียน:** ทั้งสองฟิลด์ว่างเริ่มต้น; บันทึกไม่ผ่านถ้าไม่ครบ
- **แก้ไข — ข้อมูลเก่าว่าง:** แสดง placeholder 「ยังไม่ระบุ」ได้; บันทึกได้โดยไม่กรอก
- **แก้ไข — มีค่าแล้ว:** แสดงค่าเดิม; ล้างไม่ได้
- **`readOnly`:** แสดงค่าแบบ disabled / ข้อความ ไม่แก้ได้

Constants ใหม่ใน `src/lib/students/constants.ts`:

```ts
export const STUDENT_GENDER_OPTIONS = [
  { value: "male", label: "ชาย" },
  { value: "female", label: "หญิง" },
] as const;
```

---

## 7. Server Actions & Data

### `StudentFormInput` (ขยาย)

```ts
gender: "" | "male" | "female";  // form empty string = unset
dateOfBirth: string;             // "" หรือ "YYYY-MM-DD"
```

### `createStudent` / `updateStudent`

- Map `gender` → `null` ถ้าว่างและอนุญาต
- Map `dateOfBirth` → `date_of_birth` หรือ `null`
- Validation ก่อน insert/update

### `listStudents` / `StudentListRow`

- SELECT เพิ่ม `gender`, `date_of_birth`
- ส่งเข้า `StudentSheet` `initial` ตอนแก้ไข
- **ไม่** เพิ่มคอลัมน์ในตาราง `StudentsPanel`

### Types

- อัปเดต `src/lib/supabase/types.ts` ให้สอดคล้อง migration

---

## 8. Out of Scope (YAGNI)

- คำนำหน้าอัตโนมัติ (เด็กชาย/เด็กหญิง/นาย/นางสาว) บนใบเสร็จ
- คอลัมน์เพศหรือวันเกิดในตาราง `/students`
- กรอง/รายงานตามเพศหรือช่วงอายุ
- Backfill script สำหรับนักเรียนเก่า
- E2E ทดสอบ date picker

---

## 9. Testing

| ไฟล์ | ครอบคลุม |
|------|----------|
| `src/lib/students/dates.test.ts` | พ.ศ., format, ไม่เลื่อนวันจาก timezone |
| `src/lib/students/validation.test.ts` | create บังคับ, update legacy ว่าง, update ห้ามลบค่า, วันในอนาคต |

Manual: เปิดฟอร์มเพิ่ม/แก้ไข — ปฏิทินแสดงปี พ.ศ., บันทึกนักเรียนใหม่ครบฟิลด์, แก้ไขนักเรียนเก่าที่ยังไม่มีเพศ/วันเกิดบันทึกได้

---

## 10. Implementation Files (checklist)

- [ ] `supabase/migrations/*_student_gender_birth_date.sql`
- [ ] `src/lib/students/dates.ts` + tests
- [ ] `src/lib/students/constants.ts` (gender options)
- [ ] `src/lib/students/validation.ts` + tests
- [ ] `src/lib/actions/students.ts`
- [ ] `src/lib/data/students.ts`
- [ ] `src/components/students/student-sheet.tsx`
- [ ] `src/components/ui/calendar.tsx`, `popover.tsx` (และ dependency ตาม shadcn)
- [ ] `src/lib/supabase/types.ts`

---

## 11. Success Criteria

1. Admin เพิ่มนักเรียนใหม่ได้เมื่อกรอกเพศ + วันเกิด (picker พ.ศ.)
2. Admin แก้ไขนักเรียนเก่าที่ยังไม่มีเพศ/วันเกิด — บันทึกฟิลด์อื่นได้โดยไม่บังคับกรอกสองฟิลด์นี้
3. ตารางและใบเสร็จแสดงชื่อเหมือนเดิม (ไม่มีเพศ)
4. Unit tests สำหรับ dates และ validation ผ่าน

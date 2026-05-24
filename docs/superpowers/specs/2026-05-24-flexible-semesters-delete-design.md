# Design Spec: ภาคเรียนยืดหยุ่น + ลบปี/ภาค (พร้อมตรวจข้อมูล)

**Date:** 2026-05-24  
**Status:** Approved (brainstorming)  
**Depends on:** [2026-05-24-semester-scoped-registration-design.md](./2026-05-24-semester-scoped-registration-design.md), [2026-05-24-academic-students-admin-design.md](./2026-05-24-academic-students-admin-design.md)

---

## 1. Overview

ขยายการจัดการปีการศึกษาให้:

1. **เพิ่ม/ลบภาคเรียน** ในปีการศึกษาได้ **ไม่จำกัดจำนวน** (เดิมบังคับ 2 ภาค)
2. **ลบปีการศึกษา** ได้เมื่อผ่านเงื่อนไข
3. **ตรวจสอบก่อนลบ** — ห้ามลบถ้ามีข้อมูลอ้างอิงใดๆ ในระบบ (ครบทุก FK)

### Decisions (brainstorming)

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| จำนวนภาคต่อปี | ไม่จำกัด — เพิ่ม/ลบได้ |
| ก่อนลบ | บล็อกถ้ามีข้อมูลอ้างอิงใดๆ (ตารางที่มี `semester_id` หรือ `academic_year_id`) |
| URL / selector | เลขภาคต่อเนื่อง `?year=&semester=N` (N ≥ 1) |
| ลบภาคกลาง | **ไม่เลื่อนเลข** — อาจมีช่องว่าง (เช่น ภาค 1, 3) |
| ลบปี `is_active` | **ห้าม** — ต้องตั้งปีอื่นเป็นใช้งานก่อน |
| แนวทางเทคนิค | Server Actions + `delete-eligibility` helpers (แนะนำจาก brainstorming) |

### Out of scope

- Renumber ภาคหลังลบ
- ลบปี active แบบยืนยันพิเศษ (พิมพ์ชื่อปี)
- คัดลอกโครงสร้างข้ามปีการศึกษา
- Bulk import ภาคเรียน

---

## 2. Schema changes

Migration: `supabase/migrations/YYYYMMDDHHMMSS_flexible_semesters.sql`

### `semesters`

| Change | Detail |
|--------|--------|
| Drop | `semesters_number_check` (`number IN (1, 2)`) |
| Add | `semesters_number_positive_check CHECK (number >= 1)` |
| Keep | `UNIQUE (academic_year_id, number)` — เลขซ้ำในปีเดียวกันไม่ได้; ช่องว่างหลังลบได้ |

### เพิ่มภาคใหม่

```sql
number = COALESCE((SELECT MAX(number) FROM semesters WHERE academic_year_id = ?), 0) + 1
```

วันที่ default: แบ่งช่วงปีที่ยังไม่ถูกครอบด้วยภาคอื่น หรือครึ่งหลังของช่วงว่างสุดท้าย (ใช้ logic เดียวกับ `defaultSemesterDates` ที่ปรับให้รองรับ N ภาค)

### RPC ที่มีอยู่

- `create_academic_year_with_semesters` / `update_academic_year_with_semesters` — ปรับหรือแทนที่:
  - **สร้างปี:** อย่างน้อย 1 ภาค (ไม่บังคับ 2)
  - **แก้ไขปี:** อัปเดต metadata ปี; จัดการภาคผ่าน `addSemester` / `updateSemester` / `deleteSemester` แยก

---

## 3. Delete eligibility

ไฟล์: `src/lib/academic-year/delete-eligibility.ts`

### ลบภาคเรียน (`assertSemesterDeletable(semesterId)`)

ตรวจ count > 0 ในตาราง:

| ตาราง | คอลัมน์ |
|-------|---------|
| `grade_levels` | `semester_id` |
| `classrooms` | `semester_id` |
| `student_enrollments` | `semester_id` |
| `teacher_assignments` | `semester_id` |
| `fee_rates` | `semester_id` |
| `student_invoices` | `semester_id` |

ถ้ามีแถวใดแถวหนึ่ง → `{ ok: false, reason: "semester_has_data" }`

ข้อความ UI: **ไม่สามารถลบได้ — ภาคเรียนนี้มีข้อมูลในระบบแล้ว**

### ลบปีการศึกษา (`assertAcademicYearDeletable(yearId)`)

1. ถ้า `is_active = true` → `{ ok: false, reason: "year_is_active" }`  
   ข้อความ: **ไม่สามารถลบได้ — ปีนี้กำลังใช้งานอยู่ กรุณาเปลี่ยนปีที่ใช้งานก่อน**

2. ตรวจ count > 0 ในตารางที่อ้าง `academic_year_id` โดยตรง:

| ตาราง | หมายเหตุ |
|-------|----------|
| `grade_levels` | |
| `classrooms` | |
| `student_enrollments` | |
| `teacher_assignments` | |
| `fee_rates` | |
| `student_invoices` | |
| `payments` | ไม่มี `semester_id` |

3. ถ้ามีข้อมูล → `{ ok: false, reason: "year_has_data" }`  
   ข้อความ: **ไม่สามารถลบได้ — ปีการศึกษานี้มีข้อมูลในระบบแล้ว**

4. ถ้าผ่าน — ลบ `semesters` ของปีนั้น (ว่างทุกภาค) แล้วลบ `academic_years`

ใช้ `requireAdminAction()` บนทุก mutation

---

## 4. Server actions

ไฟล์: `src/lib/actions/academic-years.ts`, `src/lib/actions/semesters.ts` (ใหม่)

| Action | พฤติกรรม |
|--------|----------|
| `addSemester(academicYearId, input?)` | สร้างภาค `number = max+1`, วันที่/ชื่อ optional |
| `updateSemester(semesterId, input)` | แก้ name, start_date, end_date; validate อยู่ในช่วงปี |
| `deleteSemester(semesterId)` | เรียก `assertSemesterDeletable` แล้ว DELETE |
| `deleteAcademicYear(yearId)` | เรียก `assertAcademicYearDeletable` แล้ว DELETE |
| `createYearWithSemesters` | ปรับให้รับ array ภาค ≥ 1 |
| `updateYearMetadata` | แก้ชื่อ/วันที่ปี/is_active โดยไม่บังคับ 2 ภาค |

`revalidatePath`: `/academic-year`, `/registration`, `/students`, `/` (dashboard)

---

## 5. UI — `/academic-year`

### ตารางปี

- คอลัมน์สรุปภาค: `3 ภาค (1, 2, 4)`
- ปุ่ม **ลบปี** + `AlertDialog` ยืนยัน
- ซ่อน/disable ลบเมื่อ active หรือมีข้อมูล

### Dialog แก้ไขปี

- รายการภาคแบบ dynamic (เลขภาค read-only, ชื่อ, วันที่)
- **+ เพิ่มภาคเรียน** → `addSemester`
- **ลบ** ต่อแถว → `deleteSemester`
- บันทึก → `updateSemester` ต่อภาคที่แก้

### Wizard สร้างปี

- เริ่ม 1 ภาค; ข้อความว่าเพิ่มภาคได้ภายหลัง

---

## 6. ผลกระทบทั้งระบบ

### Context / header

- `SemesterOption.number`: `number` (ไม่ใช่ `1 | 2`)
- `parseSemesterNumber`: รับ integer ≥ 1; ถ้าไม่มีในปี → fallback ภาคแรกที่มี (ต่ำสุด)
- `YearSemesterSelect`: รายการจาก DB ตามปี — แสดงเฉพาะเลขที่มีจริง
- Label: `ภาค {n}` หรือ `ภาค {n} ({name})`

### ลงทะเบียน

- `copySemesterStructure(sourceSemesterId, targetSemesterId)` — UI เลือกภาคต้นทาง (dropdown ภาคที่มี grade_levels)
- แสดงเมื่อภาคปัจจุบันยังไม่มีชั้น

### Types / tests

- อัปเดต `semester-params.test.ts` สำหรับเลขภาค 3+
- เพิ่ม `delete-eligibility.test.ts`

---

## 7. Testing

### Vitest

- `assertSemesterDeletable` — แต่ละตาราง block แยก
- `assertAcademicYearDeletable` — active, มี payments, ว่าง
- `resolveSemesterContext` — ปีมีภาค 1,3; param `semester=3`

### Manual

- [ ] เพิ่มภาค 3, 4 แล้วเห็นใน header
- [ ] ลบภาคว่าง (เลขไม่เลื่อน)
- [ ] ลบภาคที่มีชั้นเรียน → error
- [ ] ลบปี active → error
- [ ] ลบปีว่างสำเร็จ
- [ ] คัดลอกโครงสร้างจากภาคที่เลือก

---

## 8. Plan self-review

| Check | Result |
|-------|--------|
| Placeholders | None |
| Consistency | สอดคล้อง semester-scoped spec; ยกเลิก "ภาค 3+ out of scope" จาก spec เดิม |
| Scope | โฟกัส academic-year admin + context + copy; ไม่รวม fee UI |
| Ambiguity | เลขภาคไม่ renumber หลังลบ — ระบุชัด |

---

## 9. Execution

หลัง user อนุมัติ spec นี้ → ใช้ skill **writing-plans** สร้าง implementation plan

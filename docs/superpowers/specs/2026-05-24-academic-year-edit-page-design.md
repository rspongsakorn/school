# Design Spec: หน้าแก้ไข/สร้างปีการศึกษา (แทน Dialog)

**Date:** 2026-05-24  
**Status:** Approved (brainstorming)  
**Depends on:** [2026-05-24-flexible-semesters-delete-design.md](./2026-05-24-flexible-semesters-delete-design.md), [2026-05-24-academic-students-admin-design.md](./2026-05-24-academic-students-admin-design.md)

---

## 1. Overview

ย้ายการ **สร้าง** และ **แก้ไข** ปีการศึกษาจาก dialog ไปเป็น **หน้าเต็ม** พร้อมเลย์เอาต์สองคอลัมน์ที่อ่านง่าย และใช้ **dialog เฉพาะ** สำหรับเพิ่ม/แก้ไขภาคเรียน

### Decisions (brainstorming)

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| สร้าง + แก้ไข | หน้าเต็ม `/academic-year/new` และ `/academic-year/[id]` |
| เลย์เอาต์ | สองคอลัมน์: ซ้ายข้อมูลปี, ขวารายการภาค |
| บันทึก | ปีบันทึกแยกซ้าย; เพิ่ม/ลบภาคทันที; แก้ไขภาคผ่าน dialog |
| ภาคเรียน UI | แถวสรุป + `SemesterDialog` (create/edit) |
| จากรายการ | คลิกแถวหรือปุ่มแก้ไข → หน้า `[id]` เดียวกัน |
| `/new` flow | บันทึกปีก่อน → redirect `/academic-year/[id]` → เพิ่มภาคได้ |

### Out of scope

- เปลี่ยนกฎลบปี/ภาค (ใช้ของเดิม)
- เปลี่ยน year/semester selector บนหน้าอื่น
- Inline แก้ไขภาคบนหน้า (ไม่ใช้ dialog)

---

## 2. Routes

| Route | Access | หน้าที่ |
|-------|--------|---------|
| `/academic-year` | Admin | ตารางรายการปี |
| `/academic-year/new` | Admin | สร้างปี (คอลัมน์ขวายังไม่มีภาคจนกว่าบันทึกปี) |
| `/academic-year/[id]` | Admin | แก้ไขปี + จัดการภาค |

- `requireAdminPage()` บนทุกหน้า
- `[id]` ไม่พบ → `notFound()`
- Header: `showContextSelectors={false}`

---

## 3. หน้ารายการ `/academic-year`

### ตาราง

- คลิก **แถว** → `router.push(/academic-year/${id})`
- ปุ่ม **แก้ไข** → URL เดียวกัน (`e.stopPropagation()` บนปุ่มลบ)
- ปุ่ม **ลบ** → `AlertDialog` (เดิม) — `stopPropagation` ไม่เปิดหน้าแก้ไข
- ปุ่ม **เพิ่มปีการศึกษา** → `/academic-year/new`

### ลบ component

- `YearEditDialog` — ไม่ใช้
- `YearWizardDialog` — ไม่ใช้ (wizard หลายขั้นย้ายเป็น `/new`)

---

## 4. Layout หน้า form (`AcademicYearFormPage`)

### Page chrome

```
← กลับรายการปีการศึกษา

แก้ไขปีการศึกษา {name}          [ลบปี]  (edit only, ไม่ active)
```

- ลิงก์กลับ: `/academic-year`
- ลบปี: มุมขวาบน, `deleteAcademicYear` + confirm, redirect กลับ list

### Grid (desktop `lg:grid-cols-[320px_1fr]`, mobile stack)

**คอลัมน์ซ้าย — Card "ข้อมูลปีการศึกษา"**

| Field | |
|-------|---|
| ชื่อปีการศึกษา | text |
| วันที่เริ่ม / สิ้นสุด | date |
| ปีปัจจุบัน | checkbox `is_active` |
| ปุ่ม | **บันทึกข้อมูลปี** |

- Edit: `updateYearMetadata`
- New: `createYearWithSemesters` with semester 1 from defaults (RPC สร้างภาค 1) → redirect `[id]`
- Sticky top on large screens optional (`lg:sticky lg:top-20`)

**คอลัมน์ขวา — Card "ภาคเรียน"**

- Header: จำนวนภาค + ปุ่ม **+ เพิ่มภาคเรียน**
- New page ก่อนบันทึกปี: ข้อความ disabled *"บันทึกข้อมูลปีก่อนเพื่อเพิ่มภาคเรียน"* — ปุ่มเพิ่ม disabled
- หลังมี `yearId`: แสดง `SemesterSummaryList`

### `SemesterSummaryList` แต่ละแถว

- **ภาค {number}** — badge
- ชื่อ (ถ้ามี) · ช่วงวันที่ `formatThaiDate`
- ปุ่ม **แก้ไข** → `SemesterDialog` edit
- ปุ่ม **ลบ** → confirm → `deleteSemester`

เรียงตาม `number` ascending

---

## 5. `SemesterDialog`

**Props:**

```typescript
type SemesterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  academicYearId: string;
  initial?: { id: string; number: number; name: string; startDate: string; endDate: string };
};
```

**Create:**

- Title: เพิ่มภาคเรียน
- Default dates: `nextSemesterDefaultDates` จากปี + ภาคที่มี
- Submit: `addSemester(academicYearId, { name, startDate, endDate })`

**Edit:**

- Title: แก้ไขภาคเรียนที่ {number}
- Submit: `updateSemester(id, ...)`

**Shared:**

- `validateSemesterForm` + `FieldError`
- Success: toast + `onOpenChange(false)` + `router.refresh()`

---

## 6. `/new` flow (รายละเอียด)

1. ผู้ใช้กรอกข้อมูลปีซ้าย
2. กด **บันทึกข้อมูลปี** → `createYearWithSemesters(year, [semester1 defaults])`
3. Success → `router.push(/academic-year/${newId})`
4. หน้า `[id]` แสดงภาค 1 ที่สร้างอัตโนมัติ + ปุ่มเพิ่มภาคเพิ่มได้

ไม่ต้อง wizard 3 ขั้น

---

## 7. Data loading

**`[id]/page.tsx`:**

```typescript
const year = await getAcademicYearById(id); // หรือจาก listAcademicYears filter
if (!year) notFound();
return <AcademicYearFormPage mode="edit" year={year} />;
```

เพิ่ม `getAcademicYearById` ใน `src/lib/data/academic-years.ts` ถ้ายังไม่มี

---

## 8. File map

| File | Action |
|------|--------|
| `src/app/(dashboard)/academic-year/new/page.tsx` | Create |
| `src/app/(dashboard)/academic-year/[id]/page.tsx` | Create |
| `src/components/academic-year/academic-year-form-page.tsx` | Create |
| `src/components/academic-year/semester-dialog.tsx` | Create |
| `src/components/academic-year/semester-summary-list.tsx` | Create |
| `src/components/academic-year/academic-year-panel.tsx` | Modify — remove dialogs, link new |
| `src/components/academic-year/year-table.tsx` | Modify — row click navigate |
| `src/lib/data/academic-years.ts` | Add `getAcademicYearById` |
| `src/components/academic-year/year-edit-dialog.tsx` | Delete |
| `src/components/academic-year/year-wizard-dialog.tsx` | Delete |
| `src/components/academic-year/semester-list-editor.tsx` | Delete |

---

## 9. Responsive

- `< lg`: คอลัมน์ซ้ายบน ขวาล่าง (stack)
- Dialog ความกว้าง `max-w-md`
- ตารางรายการ: horizontal scroll ถ้าจำเป็น

---

## 10. Testing

### Manual

- [ ] List: คลิกแถว → หน้า edit
- [ ] List: แก้ไข / ลบ ไม่ conflict
- [ ] New: บันทึกปี → redirect → เพิ่มภาค dialog
- [ ] Edit: บันทึกปี, แก้ไขภาค dialog, ลบภาค, ลบปี
- [ ] Mobile stack layout อ่านง่าย

### Automated

- ไม่บังคับ unit test UI; คง validation tests เดิม

---

## 11. Plan self-review

| Check | Result |
|-------|--------|
| Placeholders | None |
| Consistency | ใช้ actions เดิม (`updateYearMetadata`, `addSemester`, etc.) |
| Scope | UI/routing only |
| Ambiguity | `/new` สร้างพร้อมภาค 1 แล้ว redirect — ระบุชัด |

---

## 12. Execution

หลัง user อนุมัติ spec → **writing-plans** สร้าง implementation plan

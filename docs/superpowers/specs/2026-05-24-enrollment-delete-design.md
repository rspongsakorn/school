# Design Spec: ลบนักเรียนออกจากห้อง (hard delete enrollment)

**Date:** 2026-05-24  
**Status:** Approved  
**Parent:** [2026-05-24-registration-design.md](./2026-05-24-registration-design.md)  
**Scope:** ปุ่มลบการลงทะเบียนออกจากห้องบน `/registration` — ลบแถว `student_enrollments` จริง

---

## 1. Problem

หน้าลงทะเบียนปัจจุบันมีเฉพาะ **เปลี่ยนสถานะ** (ลาออก / ย้ายออก) ซึ่งยังคงแถว `student_enrollments` ไว้ Spec เดิมตั้งใจ out-of-scope การลบ enrollment ถาวร

ผู้ใช้ต้องการ **ลบออกจากห้องในฐานข้อมูล** เมื่อยังไม่มีผลทางการเงิน — นักเรียนยังอยู่ในระบบ (`students`) และลงทะเบียนใหม่ได้

---

## 2. Decisions (brainstorming)

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| ขอบเขตการลบ | ลบเฉพาะ `student_enrollments` — **ไม่** ลบ `students` |
| ใบแจ้งในภาค | มีใบแจ้งแล้ว → ลบไม่ได้ ใช้เปลี่ยนสถานะแทน |
| การชำระ void | ไม่บล็อก ถ้าไม่มีใบแจ้งในภาค |
| UI | ปุ่ม **ลบออกจากห้อง** แยกจาก **เปลี่ยนสถานะ** |
| สถานะ enrollment | ลบได้เฉพาะ `status = enrolled` (รายชื่อในห้อง) |
| Bulk | Out of scope v1 |

---

## 3. Business Rules

### ลบได้ (`canDeleteEnrollment = true`)

- Enrollment `status = 'enrolled'`
- ไม่มีแถว `student_invoices` สำหรับ `(student_id, semester_id)` ของ enrollment นั้น

### ลบไม่ได้

| สถานะ | ข้อความ (ไทย) |
|--------|----------------|
| มีใบแจ้งในภาค | มีใบแจ้งชำระแล้ว — ใช้เปลี่ยนสถานะแทน |
| ไม่ใช่ enrolled | (ไม่แสดงในรายชื่อห้อง) |

### ผลหลังลบ

- แถว `student_enrollments` ถูกลบ
- `students` ยังอยู่
- นักเรียนปรากฏในรายการ "เพิ่มนักเรียน" ได้อีก (ไม่มี enrollment ในภาค หรือสร้างใหม่ได้)

---

## 4. Technical Design

### 4.1 Eligibility helper

**File:** `src/lib/enrollment/enrollment-delete-eligibility.ts`

```ts
export function canDeleteEnrollment(ctx: {
  status: EnrollmentStatus;
  hasInvoiceInSemester: boolean;
}): boolean;

export function enrollmentDeleteBlockedReason(ctx): string | null;
```

Unit tests ใน `enrollment-delete-eligibility.test.ts`

### 4.2 Server action

**File:** `src/lib/actions/enrollments.ts` — `deleteEnrollment(enrollmentId)`

1. `requireAdminAction()`
2. โหลด enrollment: `id, student_id, semester_id, status`
3. ตรวจ `status === 'enrolled'`
4. ตรวจไม่มี invoice: `student_invoices` WHERE `student_id` AND `semester_id`
5. `DELETE FROM student_enrollments WHERE id = ?`
6. `revalidateRegistrationPaths()` + finance paths ถ้าจำเป็น

### 4.3 Data layer

**File:** `src/lib/data/enrollments.ts`

- ขยาย `EnrollmentRosterRow` ด้วย `deletable: boolean`
- `loadEnrollmentDeleteFlags(roster)` — batch query invoice counts ต่อ `student_id` + `semester_id` ของห้อง

### 4.4 UI

**File:** `src/components/registration/registration-panel.tsx`

- ปุ่มลบ (Trash) ในแถว admin เมื่อ `row.deletable`
- `EnrollmentDeleteDialog` หรือ `AlertDialog` ยืนยัน
- คงปุ่มย้ายห้อง + เปลี่ยนสถานะ
- Tooltip "ลบไม่ได้" เมื่อมีใบแจ้ง

**Copy ยืนยัน:**  
*"ลบการลงทะเบียนออกจากห้องนี้ — นักเรียนยังอยู่ในระบบและสามารถลงทะเบียนใหม่ได้"*

---

## 5. Error Handling

| กรณี | พฤติกรรม |
|------|----------|
| ไม่พบ enrollment | toast error |
| มีใบแจ้ง | toast ตาม blocked reason |
| DB error | toast ทั่วไป |

---

## 6. Testing

### Unit

- `canDeleteEnrollment` — enrolled + no invoice / has invoice / wrong status

### Manual

1. ลงทะเบียน → ลบออกจากห้อง → หายจากรoster → เพิ่มกลับได้
2. ลงทะเบียน → สร้างใบแจ้ง → ลบไม่ได้ → เปลี่ยนสถานะได้
3. หน้านักเรียนยังเห็นรายชื่อนักเรียน

---

## 7. Out of Scope

- ลบ `students` จากหน้าลงทะเบียน
- ลบหลายคนพร้อมกัน
- ลบ enrollment ที่มีใบแจ้ง (ต้องลบใบแจ้งก่อน หรือใช้สถานะ)

---

## 8. Files to Touch

| File | Change |
|------|--------|
| `src/lib/enrollment/enrollment-delete-eligibility.ts` | New |
| `src/lib/enrollment/enrollment-delete-eligibility.test.ts` | New |
| `src/lib/data/enrollments.ts` | `deletable` on roster |
| `src/lib/actions/enrollments.ts` | `deleteEnrollment` |
| `src/components/registration/registration-panel.tsx` | Delete button + dialog |

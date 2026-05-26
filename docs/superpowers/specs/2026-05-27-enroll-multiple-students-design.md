# Design: เพิ่มนักเรียนเข้าห้องพร้อมกันหลายคน

**Date:** 2026-05-27
**Scope:** `EnrollStudentDialog` — เปลี่ยนจาก single-select เป็น multi-select พร้อม chip display และ bulk enrollment action

---

## ภาพรวม

แก้ไข dialog "เพิ่มนักเรียนในห้อง" ให้สามารถ tick เลือกนักเรียนได้หลายคน (selection จำไว้ข้ามการค้นหา) แสดงเป็น chip เหนือ search input แล้วลงทะเบียนทั้งหมดพร้อมกันด้วยปุ่มเดียว

---

## UI Layout (`EnrollStudentDialog`)

ลำดับใน Dialog จากบนลงล่าง:

1. **Chip area** — แสดงเฉพาะเมื่อ `selectedStudents.size > 0` เป็น `flex-wrap` scrollable row ของ Badge แต่ละ chip แสดงชื่อนักเรียน + ปุ่ม × กด × แล้วยกเลิกการเลือก
2. **Search input** — debounce 300ms เหมือนเดิม
3. **รายชื่อนักเรียน** — แต่ละแถวมี checkbox ซ้ายสุด + ชื่อ + รหัส กดทั้งแถวก็ toggle checkbox ได้
4. **DialogFooter** — ปุ่ม "ปิด" (`variant="outline"`) + ปุ่ม **"เพิ่ม N คน"** (disabled เมื่อไม่มีที่เลือก)

**Loading/submitting states:**
- ระหว่างค้นหา: แสดง "กำลังค้นหา..." ในรายการ
- ระหว่าง submit: ปุ่ม "เพิ่ม N คน" เปลี่ยนเป็น "กำลังเพิ่ม..." และ disabled, checkbox ทั้งหมด disabled
- เสร็จ: `toast.success("เพิ่ม N คนแล้ว")` → ปิด dialog → `router.refresh()`

---

## State (`EnrollStudentDialog`)

```ts
// Selection state ใหม่
const [selectedStudents, setSelectedStudents] = useState<Map<string, StudentEnrollmentCandidate>>(new Map());

// State เดิมที่ยังใช้
const [query, setQuery] = useState("");
const [candidates, setCandidates] = useState(initialCandidates);
const [loading, setLoading] = useState(false);
const [submitting, setSubmitting] = useState(false);
```

**Selection logic:**
- Toggle เลือก: `map.set(student.studentId, student)` / `map.delete(student.studentId)`
- Checkbox checked: `selectedStudents.has(student.studentId)`
- Chip render: `Array.from(selectedStudents.values())`
- Dialog ปิด: clear Map (`setSelectedStudents(new Map())`)

**handleEnroll:**
```ts
async function handleEnroll() {
  setSubmitting(true);
  const ids = Array.from(selectedStudents.keys());
  const result = await enrollStudents(ids, classroomId);
  setSubmitting(false);
  if (!result.ok) { toast.error(result.error); return; }
  toast.success(`เพิ่ม ${ids.length} คนแล้ว`);
  onOpenChange(false);
  router.refresh();
}
```

---

## Action Layer (`src/lib/actions/enrollments.ts`)

เพิ่ม `enrollStudents` server action:

```ts
export async function enrollStudents(
  studentIds: string[],
  classroomId: string,
): Promise<ActionState>
```

**Algorithm:**
1. Auth check (`requireAdminAction`)
2. ดึง classroom ครั้งเดียว (academic_year_id, semester_id)
3. ดึง existing enrollments ของ studentIds ทั้งหมดในภาคนี้ (batch query)
4. แยก ids เป็น `toUpdate` (มี enrollment อยู่แล้ว) และ `toInsert` (ใหม่)
5. Batch update (`status = 'enrolled'`) สำหรับ `toUpdate`
6. Batch insert สำหรับ `toInsert`
7. ถ้า error → return `{ ok: false, error: "ไม่สามารถลงทะเบียนได้" }`
8. `revalidateRegistrationPaths()` ครั้งเดียว
9. Return `{ ok: true }`

---

## ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|----------------|
| `src/lib/actions/enrollments.ts` | เพิ่ม `enrollStudents` action |
| `src/components/registration/enroll-student-dialog.tsx` | เปลี่ยน state + UI ทั้งหมด |

ไม่มีการเปลี่ยน DB schema, data layer, หรือไฟล์อื่น

---

## ข้อควรระวัง

- `selectedStudents` ต้อง clear เมื่อ dialog ปิด (ทั้ง success และ cancel) เพื่อไม่ให้ selection เก่าติดค้าง
- `initialCandidates` ที่รับจาก props มีการกรองนักเรียนที่ลงทะเบียนแล้วออก (`listStudentsAvailableForEnrollment`) — หลัง dialog ปิดและ refresh นักเรียนที่เพิ่งลงทะเบียนจะหายออกจากรายการโดยอัตโนมัติ
- Chip ของนักเรียนที่ถูกเลือกไว้แล้วไม่ต้องหายออกเมื่อค้นหาใหม่ — Map เป็น source of truth, รายการค้นหาเป็นแค่ view
- `enrollStudents` รับ empty array: return `{ ok: true }` ทันที (ป้องกัน unnecessary DB call)

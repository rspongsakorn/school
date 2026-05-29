# Design: ลบนักเรียนทั้งหมด

**Date:** 2026-05-29
**Scope:** หน้านักเรียน (`/students`) — เพิ่มปุ่ม "ลบนักเรียนทั้งหมด" พร้อม typed confirmation dialog

---

## ภาพรวม

เพิ่มปุ่ม "ลบนักเรียนทั้งหมด" สำหรับ admin ในหน้านักเรียน เมื่อกดจะเปิด dialog ที่ต้องพิมพ์ยืนยันก่อน จากนั้น server action จะลบนักเรียนทุกคนในระบบที่ลบได้ (ข้ามคนที่มีประวัติการลงทะเบียนหรือการเงิน — เงื่อนไขเดียวกับการลบทั่วไป)

---

## UI (`StudentsPanel`)

### ปุ่ม

- ปุ่ม **"ลบนักเรียนทั้งหมด"** อยู่ใน admin toolbar (ข้างๆ ปุ่ม "นำเข้า CSV" และ "เพิ่มนักเรียน")
- แสดงเฉพาะเมื่อ `isAdmin === true`
- `variant="outline"` + `className="text-destructive"`

### Confirmation Dialog (`Dialog` จาก shadcn/ui)

- **Title:** "ลบนักเรียนทั้งหมด"
- **Description:** "การลบไม่สามารถย้อนกลับได้ นักเรียนที่มีประวัติการลงทะเบียนหรือการเงินจะถูกข้าม"
- **Input:** `placeholder="พิมพ์ ลบทั้งหมด เพื่อยืนยัน"`
- **ปุ่ม "ยืนยันลบ":** `variant="destructive"` — disabled จนกว่า input จะตรงกับ `"ลบทั้งหมด"` (exact match) หรือ `deleting === true`
- **ปุ่ม "ยกเลิก":** `variant="outline"` — disabled ระหว่าง `deleting`
- เมื่อ dialog ปิด → clear input

### State ที่เพิ่มใหม่

```ts
const [deleteAllOpen, setDeleteAllOpen] = useState(false);
const [deleteAllConfirmText, setDeleteAllConfirmText] = useState("");
const [deletingAll, setDeletingAll] = useState(false);
```

### handleDeleteAll

```ts
async function handleDeleteAll() {
  setDeletingAll(true);
  const result = await deleteAllStudents();
  setDeletingAll(false);

  if (!result.ok) {
    toast.error(result.error);
    return;
  }

  setDeleteAllOpen(false);
  if (result.skipped > 0) {
    toast.success(`ลบแล้ว ${result.deleted} คน (ข้าม ${result.skipped} คนที่ลบไม่ได้)`);
  } else {
    toast.success(`ลบนักเรียนแล้ว ${result.deleted} คน`);
  }
  void queryClient.invalidateQueries({ queryKey: ["students"] });
  void queryClient.invalidateQueries({ queryKey: ["enrollment-candidates"] });
  void queryClient.invalidateQueries({ queryKey: ["classroom-roster"] });
  void queryClient.invalidateQueries({ queryKey: ["classrooms-by-grade"] });
  router.refresh();
}
```

---

## Action Layer (`src/lib/actions/students.ts`)

เพิ่ม `deleteAllStudents` — reuse `DeleteStudentsResult` type เดิม:

```ts
export async function deleteAllStudents(): Promise<DeleteStudentsResult>
```

**Algorithm:**
1. Auth check (`requireAdminAction`)
2. Query `students.select("id")` ทั้งหมด (ไม่มี filter สถานะ)
3. ถ้าไม่มีนักเรียนเลย → return `{ ok: true, deleted: 0, skipped: 0 }`
4. Pre-check: query `student_enrollments` (status = "enrolled") และ `payments` (status = "active") แบบ batch
5. แยก `deletableIds` และ `skipped`
6. ลบ dependents + ลบ student records สำหรับ `deletableIds`
7. `revalidatePath("/students")`
8. Return `{ ok: true, deleted, skipped }`

**หมายเหตุ:** ใช้ logic เดียวกับ `deleteStudents` ทุกประการ (เงื่อนไข, partial success, error messages)

---

## ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|----------------|
| `src/lib/actions/students.ts` | เพิ่ม `deleteAllStudents` action |
| `src/components/students/students-panel.tsx` | เพิ่มปุ่ม + state + confirmation dialog |

ไม่มีการเปลี่ยนแปลง DB schema, data layer, หรือไฟล์อื่น

---

## ข้อควรระวัง

- Confirmation ต้องเป็น **exact match** กับ `"ลบทั้งหมด"` (case-sensitive) — ป้องกัน accidental delete
- Dialog input ต้อง clear ทุกครั้งที่ dialog ปิด (ทั้ง success และ cancel)
- `deletingAll` ต้อง disable ทั้งปุ่ม "ยืนยันลบ" และ "ยกเลิก" ระหว่างรอ
- `deleteAllStudents` reuse `DeleteStudentsResult` type เดิม — ไม่สร้าง type ใหม่

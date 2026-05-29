# Delete All Students Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มปุ่ม "ลบนักเรียนทั้งหมด" ในหน้านักเรียน พร้อม typed confirmation dialog และ server action ที่ลบ partial success

**Architecture:** เพิ่ม `deleteAllStudents()` server action ที่ query student IDs ทั้งหมดแล้วใช้ logic เดิมของ `deleteStudents` (pre-check enrollments/payments → delete deletable → skip blocked) ฝั่ง UI เพิ่มปุ่มและ Dialog ที่บังคับพิมพ์ "ลบทั้งหมด" ก่อนยืนยัน

**Tech Stack:** Next.js 15 App Router, Supabase, TypeScript, shadcn/ui (Dialog, Button, Input), TanStack Query, Vitest

---

## File Map

| ไฟล์ | สถานะ | หน้าที่ |
|------|--------|---------|
| `src/lib/actions/students.ts` | แก้ไข | เพิ่ม `deleteAllStudents` server action |
| `src/components/students/students-panel.tsx` | แก้ไข | เพิ่มปุ่ม + state + confirmation dialog |

---

## Task 1: `deleteAllStudents` server action

**Files:**
- Modify: `src/lib/actions/students.ts`

- [ ] **Step 1: เพิ่ม `deleteAllStudents` ต่อท้ายไฟล์**

เปิด `src/lib/actions/students.ts` อ่านไฟล์ก่อน แล้วเพิ่มต่อท้าย (หลัง `deleteStudents`):

```ts
export async function deleteAllStudents(): Promise<DeleteStudentsResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const { data: allStudents, error: fetchError } = await supabase
    .from("students")
    .select("id");

  if (fetchError) return { ok: false, error: "ไม่สามารถดึงข้อมูลนักเรียนได้" };

  const allIds = (allStudents ?? []).map((s) => s.id);

  if (allIds.length === 0) {
    return { ok: true, deleted: 0, skipped: 0 };
  }

  const [activeEnrollments, activePayments] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("student_id")
      .in("student_id", allIds)
      .eq("status", "enrolled"),
    supabase
      .from("payments")
      .select("student_id")
      .in("student_id", allIds)
      .eq("status", "active"),
  ]);

  const blockedIds = new Set<string>();
  for (const row of activeEnrollments.data ?? []) blockedIds.add(row.student_id);
  for (const row of activePayments.data ?? []) blockedIds.add(row.student_id);

  const deletableIds = allIds.filter((id) => !blockedIds.has(id));
  const skipped = allIds.length - deletableIds.length;

  for (const studentId of deletableIds) {
    const cleanup = await deleteStudentDependents(supabase, studentId);
    if (!cleanup.ok) return cleanup;

    const { error } = await supabase.from("students").delete().eq("id", studentId);
    if (error) return { ok: false, error: "ไม่สามารถลบนักเรียนได้" };
  }

  revalidatePath("/students");
  revalidatePath("/registration");
  revalidatePath("/invoices");
  revalidatePath("/payments");
  revalidatePath("/reports/outstanding");
  revalidatePath("/reports/collections");
  return { ok: true, deleted: deletableIds.length, skipped };
}
```

**หมายเหตุ:** `deleteStudentDependents` และ `revalidatePath` มีอยู่แล้วในไฟล์ ไม่ต้อง import เพิ่ม `DeleteStudentsResult` type ก็มีอยู่แล้ว

- [ ] **Step 2: ตรวจ TypeScript**

```
npx tsc --noEmit
```

Expected: ไม่มี error

- [ ] **Step 3: รัน tests**

```
npx vitest run
```

Expected: ทุก test ผ่าน (action ไม่มี pure function ใหม่ที่ต้อง test แยก)

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/students.ts
git commit -m "feat: deleteAllStudents server action"
```

---

## Task 2: UI — ปุ่มและ Confirmation Dialog

**Files:**
- Modify: `src/components/students/students-panel.tsx`

- [ ] **Step 1: เพิ่ม imports ที่ขาด**

เปิด `src/components/students/students-panel.tsx` แล้วเพิ่ม import ต่อไปนี้ในส่วน import (ต่อจาก imports ที่มีอยู่แล้ว):

```ts
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteAllStudents } from "@/lib/actions/students";
```

**หมายเหตุ:** `deleteStudents` มีอยู่แล้วใน import จาก `@/lib/actions/students` — ให้เพิ่ม `deleteAllStudents` ใน import เดิม ไม่ต้องสร้าง import line ใหม่

- [ ] **Step 2: เพิ่ม state 3 ตัว**

ในฟังก์ชัน `StudentsPanel` หา block ที่ประกาศ state (บริเวณ `const [createOpen, ...]`) แล้วเพิ่ม 3 บรรทัดนี้ต่อท้าย:

```ts
const [deleteAllOpen, setDeleteAllOpen] = useState(false);
const [deleteAllConfirmText, setDeleteAllConfirmText] = useState("");
const [deletingAll, setDeletingAll] = useState(false);
```

- [ ] **Step 3: เพิ่ม `handleDeleteAll` function**

เพิ่มหลัง `confirmDelete` function:

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

- [ ] **Step 4: เพิ่มปุ่ม "ลบนักเรียนทั้งหมด" ใน toolbar**

หา `<div className="flex flex-wrap gap-2">` ที่อยู่ใน `{isAdmin ? (...) : null}` block แล้วเพิ่มปุ่มนี้ก่อนปุ่ม "นำเข้า CSV":

```tsx
<Button
  type="button"
  variant="outline"
  className="text-destructive"
  onClick={() => setDeleteAllOpen(true)}
>
  ลบนักเรียนทั้งหมด
</Button>
```

ผลลัพธ์ที่ต้องการ (ลำดับปุ่มจากซ้ายไปขวา):
1. ลบที่เลือก (N) — แสดงเมื่อ bulkDeleteCount > 0
2. **ลบนักเรียนทั้งหมด** ← ใหม่
3. นำเข้า CSV
4. เพิ่มนักเรียน

- [ ] **Step 5: เพิ่ม Confirmation Dialog**

เพิ่ม Dialog ต่อท้ายไฟล์ ก่อน closing tag `</>` สุดท้าย (หลัง AlertDialog สำหรับ deleteTargetIds):

```tsx
{isAdmin ? (
  <Dialog
    open={deleteAllOpen}
    onOpenChange={(open) => {
      if (!open && !deletingAll) {
        setDeleteAllOpen(false);
        setDeleteAllConfirmText("");
      }
    }}
  >
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>ลบนักเรียนทั้งหมด</DialogTitle>
        <DialogDescription>
          การลบไม่สามารถย้อนกลับได้ นักเรียนที่มีประวัติการลงทะเบียนหรือการเงินจะถูกข้าม
        </DialogDescription>
      </DialogHeader>
      <div className="py-2">
        <Input
          value={deleteAllConfirmText}
          onChange={(e) => setDeleteAllConfirmText(e.target.value)}
          placeholder='พิมพ์ "ลบทั้งหมด" เพื่อยืนยัน'
          disabled={deletingAll}
        />
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={deletingAll}
          onClick={() => {
            setDeleteAllOpen(false);
            setDeleteAllConfirmText("");
          }}
        >
          ยกเลิก
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={deleteAllConfirmText !== "ลบทั้งหมด" || deletingAll}
          onClick={handleDeleteAll}
        >
          {deletingAll ? "กำลังลบ..." : "ยืนยันลบ"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
) : null}
```

- [ ] **Step 6: ตรวจ TypeScript**

```
npx tsc --noEmit
```

Expected: ไม่มี error

- [ ] **Step 7: รัน tests**

```
npx vitest run
```

Expected: 90 tests ผ่านทั้งหมด

- [ ] **Step 8: Commit**

```bash
git add src/components/students/students-panel.tsx
git commit -m "feat: delete all students button with typed confirmation dialog"
```

---

## Task 3: ทดสอบใน browser

- [ ] **Step 1: รัน dev server**

```
npm run dev
```

เปิด `http://localhost:3000/students` (login ด้วย admin account)

- [ ] **Step 2: ตรวจปุ่มปรากฏ**

ปุ่ม "ลบนักเรียนทั้งหมด" ต้องปรากฏใน toolbar ฝั่งขวา (ก่อนปุ่ม "นำเข้า CSV")

- [ ] **Step 3: ทดสอบ dialog และ typed confirmation**

1. กดปุ่ม "ลบนักเรียนทั้งหมด" → dialog เปิด
2. ปุ่ม "ยืนยันลบ" ต้อง disabled
3. พิมพ์ "ลบทั้งห" (ไม่ครบ) → ปุ่มยังต้อง disabled
4. พิมพ์ "ลบทั้งหมด" (ตรง exact) → ปุ่ม "ยืนยันลบ" enabled
5. กด "ยกเลิก" → dialog ปิด, input ถูก clear

- [ ] **Step 4: ทดสอบการลบจริง**

1. เปิด dialog → พิมพ์ "ลบทั้งหมด" → กด "ยืนยันลบ"
2. ระหว่าง submit: ปุ่มทั้งสองต้อง disabled, "กำลังลบ..."
3. เสร็จ: toast แสดงจำนวนที่ลบ → รายชื่อนักเรียนหาย

- [ ] **Step 5: ทดสอบ dialog ปิดแล้ว input clear**

1. เปิด dialog → พิมพ์บางส่วน → กด "ยกเลิก"
2. เปิด dialog ใหม่ → input ต้องว่าง

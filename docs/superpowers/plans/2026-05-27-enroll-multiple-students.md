# Multi-Student Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยน dialog เพิ่มนักเรียนในห้องจาก single-select เป็น multi-select พร้อม chip display และ bulk enrollment action

**Architecture:** เพิ่ม `enrollStudents` server action ที่ batch upsert นักเรียนหลายคนใน 1 round-trip แล้วปรับ `EnrollStudentDialog` ให้ใช้ `Map<studentId, candidate>` เป็น selection state ซึ่งคงอยู่ข้ามการค้นหา แสดงเป็น chip เหนือ search input

**Tech Stack:** Next.js 15 App Router, Supabase, TypeScript, shadcn/ui (Badge, Button, Dialog, Input), lucide-react (X icon), Vitest

---

## File Map

| ไฟล์ | สถานะ | หน้าที่ |
|------|--------|---------|
| `src/lib/actions/enrollments.ts` | แก้ไข | เพิ่ม `enrollStudents` bulk action |
| `src/components/registration/enroll-student-dialog.tsx` | แก้ไข | เปลี่ยน state + UI ทั้งหมดเป็น multi-select |

---

## Task 1: `enrollStudents` server action

**Files:**
- Modify: `src/lib/actions/enrollments.ts`

- [ ] **Step 1: เพิ่ม `enrollStudents` function ต่อท้ายไฟล์**

เปิด `src/lib/actions/enrollments.ts` อ่านไฟล์ก่อน แล้วเพิ่มต่อท้ายไฟล์:

```ts
export async function enrollStudents(
  studentIds: string[],
  classroomId: string,
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  if (studentIds.length === 0) return { ok: true };

  const supabase = await createClient();

  const { data: classroom, error: classroomError } = await supabase
    .from("classrooms")
    .select("id, academic_year_id, semester_id")
    .eq("id", classroomId)
    .maybeSingle();

  if (classroomError || !classroom) {
    return { ok: false, error: "ไม่พบห้องเรียน" };
  }

  // ดึง existing enrollments ของ studentIds ทั้งหมดในภาคนี้ (batch)
  const { data: existing } = await supabase
    .from("student_enrollments")
    .select("id, student_id")
    .eq("semester_id", classroom.semester_id)
    .in("student_id", studentIds);

  const existingMap = new Map((existing ?? []).map((e) => [e.student_id, e.id]));
  const toUpdate = studentIds.filter((id) => existingMap.has(id));
  const toInsert = studentIds.filter((id) => !existingMap.has(id));

  if (toUpdate.length > 0) {
    const enrollmentIds = toUpdate.map((sid) => existingMap.get(sid)!);
    const { error } = await supabase
      .from("student_enrollments")
      .update({ classroom_id: classroomId, status: "enrolled" })
      .in("id", enrollmentIds);
    if (error) return { ok: false, error: "ไม่สามารถลงทะเบียนได้" };
  }

  if (toInsert.length > 0) {
    const rows = toInsert.map((studentId) => ({
      student_id: studentId,
      classroom_id: classroomId,
      academic_year_id: classroom.academic_year_id,
      semester_id: classroom.semester_id,
      status: "enrolled" as const,
    }));
    const { error } = await supabase.from("student_enrollments").insert(rows);
    if (error?.code === "23505") {
      return { ok: false, error: "นักเรียนบางคนลงทะเบียนในภาคนี้แล้ว" };
    }
    if (error) return { ok: false, error: "ไม่สามารถลงทะเบียนได้" };
  }

  revalidateRegistrationPaths();
  return { ok: true };
}
```

- [ ] **Step 2: ตรวจ TypeScript**

```
npx tsc --noEmit
```

Expected: ไม่มี error

- [ ] **Step 3: รัน test ทั้งหมด**

```
npx vitest run
```

Expected: PASS ทั้งหมด (ไม่มี test ใหม่ในขั้นนี้ — action เป็น server-side DB code)

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/enrollments.ts
git commit -m "feat: enrollStudents bulk action with batch upsert"
```

---

## Task 2: อัปเดต `EnrollStudentDialog` เป็น multi-select

**Files:**
- Modify: `src/components/registration/enroll-student-dialog.tsx`

- [ ] **Step 1: แทนที่เนื้อหาทั้งหมดของไฟล์**

แทนที่ `src/components/registration/enroll-student-dialog.tsx` ด้วยโค้ดต่อไปนี้:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { enrollStudents, searchStudentsForEnrollment } from "@/lib/actions/enrollments";
import type { StudentEnrollmentCandidate } from "@/lib/data/enrollments";

type EnrollStudentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterId: string;
  classroomId: string;
  initialCandidates: StudentEnrollmentCandidate[];
};

export function EnrollStudentDialog({
  open,
  onOpenChange,
  semesterId,
  classroomId,
  initialCandidates,
}: EnrollStudentDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState(initialCandidates);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<
    Map<string, StudentEnrollmentCandidate>
  >(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCandidates(initialCandidates);
    setSelectedStudents(new Map());
  }, [open, initialCandidates]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const results = await searchStudentsForEnrollment(semesterId, value);
      setCandidates(results);
      setLoading(false);
    }, 300);
  }

  function toggleStudent(student: StudentEnrollmentCandidate) {
    setSelectedStudents((prev) => {
      const next = new Map(prev);
      if (next.has(student.studentId)) {
        next.delete(student.studentId);
      } else {
        next.set(student.studentId, student);
      }
      return next;
    });
  }

  function removeStudent(studentId: string) {
    setSelectedStudents((prev) => {
      const next = new Map(prev);
      next.delete(studentId);
      return next;
    });
  }

  async function handleEnroll() {
    setSubmitting(true);
    const ids = Array.from(selectedStudents.keys());
    const result = await enrollStudents(ids, classroomId);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`เพิ่ม ${ids.length} คนแล้ว`);
    onOpenChange(false);
    router.refresh();
  }

  const selectedList = Array.from(selectedStudents.values());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>เพิ่มนักเรียนในห้อง</DialogTitle>
          <DialogDescription>
            ค้นหารหัสหรือชื่อนักเรียนที่ยังไม่ได้ลงทะเบียนในภาคนี้
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {selectedList.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedList.map((student) => (
                <Badge
                  key={student.studentId}
                  variant="secondary"
                  className="gap-1 pr-1"
                >
                  {student.name}
                  <button
                    type="button"
                    onClick={() => removeStudent(student.studentId)}
                    className="ml-0.5 rounded-full hover:bg-muted"
                    disabled={submitting}
                    aria-label={`ยกเลิก ${student.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <Input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="ค้นหารหัส ชื่อ หรือนามสกุล"
          />
          <div className="max-h-64 overflow-y-auto rounded-md border">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">กำลังค้นหา...</p>
            ) : candidates.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                ไม่พบนักเรียนที่เลือกได้
              </p>
            ) : (
              <ul>
                {candidates.map((student) => (
                  <li key={student.studentId} className="border-b last:border-b-0">
                    <button
                      type="button"
                      disabled={submitting}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
                      onClick={() => toggleStudent(student)}
                    >
                      <input
                        type="checkbox"
                        className="size-4 rounded border-border accent-primary"
                        checked={selectedStudents.has(student.studentId)}
                        onChange={() => toggleStudent(student)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`เลือก ${student.name}`}
                      />
                      <span className="flex-1 font-medium">{student.name}</span>
                      <span className="text-muted-foreground">
                        {student.studentCode}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            ปิด
          </Button>
          <Button
            type="button"
            disabled={selectedStudents.size === 0 || submitting}
            onClick={handleEnroll}
          >
            {submitting
              ? "กำลังเพิ่ม..."
              : selectedStudents.size === 0
                ? "เพิ่มนักเรียน"
                : `เพิ่ม ${selectedStudents.size} คน`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: ตรวจ TypeScript**

```
npx tsc --noEmit
```

Expected: ไม่มี error

- [ ] **Step 3: รัน test ทั้งหมด**

```
npx vitest run
```

Expected: PASS 90 tests (ไม่มี test ใหม่ — component เป็น React UI ทดสอบด้วย browser)

- [ ] **Step 4: Commit**

```bash
git add src/components/registration/enroll-student-dialog.tsx
git commit -m "feat: multi-select enrollment dialog with chip display"
```

---

## Task 3: ทดสอบใน browser

- [ ] **Step 1: รัน dev server**

```
npm run dev
```

เปิด `http://localhost:3000/registration`

- [ ] **Step 2: ทดสอบ single enrollment**

1. เลือก grade และ classroom
2. กดปุ่ม "เพิ่มนักเรียน" → dialog เปิด
3. Tick นักเรียน 1 คน → chip ปรากฏเหนือ search input
4. ปุ่มเปลี่ยนเป็น "เพิ่ม 1 คน"
5. กด "เพิ่ม 1 คน" → toast.success "เพิ่ม 1 คนแล้ว" → dialog ปิด → นักเรียนปรากฏใน roster

- [ ] **Step 3: ทดสอบ multi enrollment**

1. เปิด dialog → tick นักเรียน 3 คน
2. ตรวจว่า chip ทั้ง 3 ปรากฏ และปุ่มแสดง "เพิ่ม 3 คน"
3. กด "เพิ่ม 3 คน" → toast.success "เพิ่ม 3 คนแล้ว" → dialog ปิด → ทั้ง 3 คนอยู่ใน roster

- [ ] **Step 4: ทดสอบ selection ข้ามการค้นหา**

1. เปิด dialog → ค้นหาชื่อแรก → tick 1 คน
2. ลบ search แล้วค้นหาชื่อที่สอง → chip ของคนแรกยังอยู่
3. Tick อีก 1 คน → ปุ่มแสดง "เพิ่ม 2 คน"
4. กด "เพิ่ม 2 คน" → ทั้ง 2 คนอยู่ใน roster

- [ ] **Step 5: ทดสอบ chip ×**

1. Tick นักเรียน 2 คน → กด × บน chip คนแรก
2. chip หาย, checkbox คนแรกถูก untick (ถ้าอยู่ใน search ปัจจุบัน)
3. ปุ่มแสดง "เพิ่ม 1 คน"

- [ ] **Step 6: ทดสอบปิด dialog**

1. Tick หลายคน → กด "ปิด"
2. เปิด dialog ใหม่ → chip ว่าง, checkbox ทั้งหมด untick

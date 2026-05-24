"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  STUDENT_STATUS_FILTER_OPTIONS,
  type StudentStatus,
} from "@/lib/students/constants";
import {
  createStudent,
  deleteStudent,
  updateStudent,
} from "@/lib/actions/students";

type StudentSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  readOnly?: boolean;
  initial?: {
    id: string;
    studentCode: string;
    firstName: string;
    lastName: string;
    idCard: string | null;
    status: StudentStatus;
  };
};

type StudentFormState = {
  studentCode: string;
  firstName: string;
  lastName: string;
  idCard: string;
  status: StudentStatus;
};

const STATUS_OPTIONS = STUDENT_STATUS_FILTER_OPTIONS.filter(
  (option) => option.value !== "all",
);

const initialForm: StudentFormState = {
  studentCode: "",
  firstName: "",
  lastName: "",
  idCard: "",
  status: "active",
};

function buildInitialForm(
  mode: "create" | "edit",
  initial?: StudentSheetProps["initial"],
): StudentFormState {
  if (mode === "edit" && initial) {
    return {
      studentCode: initial.studentCode,
      firstName: initial.firstName,
      lastName: initial.lastName,
      idCard: initial.idCard ?? "",
      status: initial.status,
    };
  }
  return initialForm;
}

export function StudentSheet({
  open,
  onOpenChange,
  mode,
  readOnly = false,
  initial,
}: StudentSheetProps) {
  const router = useRouter();
  const [form, setForm] = useState<StudentFormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(buildInitialForm(mode, initial));
  }, [open, mode, initial]);

  const isEditMode = mode === "edit";
  const canDelete = isEditMode && !readOnly && Boolean(initial?.id);
  const title = isEditMode ? "แก้ไขข้อมูลนักเรียน" : "เพิ่มนักเรียน";
  const description = isEditMode
    ? "ปรับข้อมูลประวัตินักเรียนและสถานะการเรียน"
    : "กรอกข้อมูลนักเรียนเพื่อเพิ่มเข้าสู่ระบบ";
  const saveLabel = useMemo(() => {
    if (submitting) return "กำลังบันทึก...";
    return isEditMode ? "บันทึกการแก้ไข" : "บันทึกนักเรียน";
  }, [isEditMode, submitting]);

  function updateField<Key extends keyof StudentFormState>(
    key: Key,
    value: StudentFormState[Key],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (readOnly || submitting) return;

    setSubmitting(true);
    try {
      const result = isEditMode
        ? await updateStudent(initial?.id ?? "", form)
        : await createStudent(form);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(isEditMode ? "บันทึกข้อมูลนักเรียนแล้ว" : "เพิ่มนักเรียนเรียบร้อยแล้ว");
      onOpenChange(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!canDelete || submitting || !initial?.id) return;

    setSubmitting(true);
    try {
      const result = await deleteStudent(initial.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("ลบนักเรียนเรียบร้อยแล้ว");
      setDeleteOpen(false);
      onOpenChange(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 px-4">
          <div className="grid gap-2">
            <Label htmlFor="student-code">รหัสนักเรียน</Label>
            <Input
              id="student-code"
              value={form.studentCode}
              onChange={(e) => updateField("studentCode", e.target.value)}
              placeholder="เช่น 67001"
              disabled={readOnly || submitting}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="student-first-name">ชื่อ</Label>
            <Input
              id="student-first-name"
              value={form.firstName}
              onChange={(e) => updateField("firstName", e.target.value)}
              disabled={readOnly || submitting}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="student-last-name">นามสกุล</Label>
            <Input
              id="student-last-name"
              value={form.lastName}
              onChange={(e) => updateField("lastName", e.target.value)}
              disabled={readOnly || submitting}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="student-id-card">เลขบัตรประชาชน</Label>
            <Input
              id="student-id-card"
              value={form.idCard}
              onChange={(e) => updateField("idCard", e.target.value)}
              placeholder="ไม่บังคับ"
              disabled={readOnly || submitting}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="student-status">สถานะ</Label>
            <Select
              value={form.status}
              onValueChange={(value) => updateField("status", value as StudentStatus)}
              disabled={readOnly || submitting}
            >
              <SelectTrigger id="student-status" className="w-full">
                <SelectValue placeholder="เลือกสถานะ" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter className="gap-2 border-t">
          {canDelete ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={submitting}
            >
              ลบนักเรียน
            </Button>
          ) : null}
          <div className="flex flex-1 justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ปิด
            </Button>
            {!readOnly ? (
              <Button type="button" onClick={handleSave} disabled={submitting}>
                {saveLabel}
              </Button>
            ) : null}
          </div>
        </SheetFooter>
      </SheetContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบนักเรียน</AlertDialogTitle>
            <AlertDialogDescription>
              การลบจะถาวรและไม่สามารถกู้คืนได้ หากมีประวัติการลงทะเบียนหรือการเงิน ระบบจะไม่อนุญาตให้ลบ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting ? "กำลังลบ..." : "ยืนยันลบ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

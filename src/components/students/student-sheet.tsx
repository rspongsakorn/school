"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  validateStudentForm,
  type StudentFormErrors,
  type StudentFormInput,
} from "@/lib/students/validation";

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

type StudentFormState = StudentFormInput;

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
  const formKey = open ? `${mode}-${initial?.id ?? "new"}` : "closed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <StudentSheetBody
            key={formKey}
            mode={mode}
            readOnly={readOnly}
            initial={initial}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StudentSheetBody({
  mode,
  readOnly,
  initial,
  onOpenChange,
}: {
  mode: "create" | "edit";
  readOnly: boolean;
  initial?: StudentSheetProps["initial"];
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<StudentFormState>(() => buildInitialForm(mode, initial));
  const [errors, setErrors] = useState<StudentFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
    if (key in errors) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as keyof StudentFormErrors];
        return next;
      });
    }
  }

  async function handleSave() {
    if (readOnly || submitting) return;

    const validation = validateStudentForm(form);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
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
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="student-code">รหัสนักเรียน</Label>
          <Input
            id="student-code"
            value={form.studentCode}
            onChange={(e) => updateField("studentCode", e.target.value)}
            placeholder="เช่น 67001"
            disabled={readOnly || submitting}
            aria-invalid={Boolean(errors.studentCode)}
          />
          <FieldError message={errors.studentCode} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="student-first-name">ชื่อ</Label>
          <Input
            id="student-first-name"
            value={form.firstName}
            onChange={(e) => updateField("firstName", e.target.value)}
            disabled={readOnly || submitting}
            aria-invalid={Boolean(errors.firstName)}
          />
          <FieldError message={errors.firstName} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="student-last-name">นามสกุล</Label>
          <Input
            id="student-last-name"
            value={form.lastName}
            onChange={(e) => updateField("lastName", e.target.value)}
            disabled={readOnly || submitting}
            aria-invalid={Boolean(errors.lastName)}
          />
          <FieldError message={errors.lastName} />
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
            items={STATUS_OPTIONS}
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

      <DialogFooter className="sm:justify-between">
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
      </DialogFooter>

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
    </>
  );
}
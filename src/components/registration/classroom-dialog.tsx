"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClassroom, updateClassroom } from "@/lib/actions/classrooms";
import { validateClassroomName } from "@/lib/enrollment/validation";

type ClassroomDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  semesterId: string;
  gradeLevelId: string;
  initial?: { id: string; name: string };
};

export function ClassroomDialog({
  open,
  onOpenChange,
  mode,
  semesterId,
  gradeLevelId,
  initial,
}: ClassroomDialogProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setNameError(undefined);
  }, [open, initial?.id, initial?.name]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateClassroomName(name);
    if (!validation.ok) {
      setNameError(validation.error);
      return;
    }
    setNameError(undefined);
    setSubmitting(true);

    const result =
      mode === "create"
        ? await createClassroom(semesterId, gradeLevelId, { name })
        : await updateClassroom(initial!.id, { name });

    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(mode === "create" ? "เพิ่มห้องเรียนแล้ว" : "บันทึกห้องเรียนแล้ว");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "เพิ่มห้องเรียน" : "แก้ไขห้องเรียน"}</DialogTitle>
            <DialogDescription>กำหนดชื่อห้องเรียน เช่น 1/1</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="classroom-name">ชื่อห้องเรียน</Label>
              <Input
                id="classroom-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="1/1"
              />
              <FieldError message={nameError} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

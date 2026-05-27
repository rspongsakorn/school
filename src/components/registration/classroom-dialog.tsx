"use client";

import { useEffect, useState } from "react";
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
import { validateClassroomNumber } from "@/lib/enrollment/validation";

type ClassroomDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  semesterId: string;
  gradeLevelId: string;
  gradeName: string;
  initial?: { id: string; name: string };
  onSuccess?: () => void;
};

export function ClassroomDialog({
  open,
  onOpenChange,
  mode,
  semesterId,
  gradeLevelId,
  gradeName,
  initial,
  onSuccess,
}: ClassroomDialogProps) {
  // roomNumber stores only the digit part, e.g. "3"
  const [roomNumber, setRoomNumber] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // extract trailing number from stored name e.g. "ป.1/3" → "3"
    const stored = initial?.name ?? "";
    const slashIdx = stored.lastIndexOf("/");
    setRoomNumber(slashIdx >= 0 ? stored.slice(slashIdx + 1) : stored);
    setNameError(undefined);
  }, [open, initial?.id, initial?.name]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateClassroomNumber(roomNumber);
    if (!validation.ok) {
      setNameError(validation.error);
      return;
    }
    setNameError(undefined);
    setSubmitting(true);

    const name = roomNumber.trim();
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
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "เพิ่มห้องเรียน" : "แก้ไขห้องเรียน"}</DialogTitle>
            <DialogDescription>กรอกหมายเลขห้อง เช่น 1, 2, 3</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="classroom-name">หมายเลขห้อง</Label>
              <div className="flex items-center rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <span className="select-none border-r border-input px-3 py-2 text-sm text-muted-foreground">
                  {gradeName}/
                </span>
                <Input
                  id="classroom-name"
                  className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={roomNumber}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, "");
                    setRoomNumber(val);
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="1"
                  maxLength={3}
                />
              </div>
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

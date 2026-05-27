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
import { createGradeLevel, updateGradeLevel } from "@/lib/actions/grade-levels";
import { validateGradeLevelName } from "@/lib/enrollment/validation";

type GradeLevelDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  semesterId: string;
  initial?: { id: string; name: string; sortOrder: number };
  onSuccess?: () => void;
};

export function GradeLevelDialog({
  open,
  onOpenChange,
  mode,
  semesterId,
  initial,
  onSuccess,
}: GradeLevelDialogProps) {
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [nameError, setNameError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setSortOrder(String(initial?.sortOrder ?? 0));
    setNameError(undefined);
  }, [open, initial?.id, initial?.name, initial?.sortOrder]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateGradeLevelName(name);
    if (!validation.ok) {
      setNameError(validation.error);
      return;
    }
    setNameError(undefined);
    setSubmitting(true);

    const sort = Number.parseInt(sortOrder, 10) || 0;
    const result =
      mode === "create"
        ? await createGradeLevel(semesterId, { name, sortOrder: sort })
        : await updateGradeLevel(initial!.id, { name, sortOrder: sort });

    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(mode === "create" ? "เพิ่มชั้นเรียนแล้ว" : "บันทึกชั้นเรียนแล้ว");
    onOpenChange(false);
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "เพิ่มชั้นเรียน" : "แก้ไขชั้นเรียน"}</DialogTitle>
            <DialogDescription>กำหนดชื่อชั้นเรียน เช่น ป.1 หรือ ม.1</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="grade-name">ชื่อชั้นเรียน</Label>
              <Input
                id="grade-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ป.1"
              />
              <FieldError message={nameError} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="grade-sort">ลำดับ</Label>
              <Input
                id="grade-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
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

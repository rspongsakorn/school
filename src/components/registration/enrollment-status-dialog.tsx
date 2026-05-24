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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateEnrollmentStatus } from "@/lib/actions/enrollments";
import {
  ENROLLMENT_STATUS_OPTIONS,
  type EnrollmentStatus,
} from "@/lib/enrollment/constants";

type EnrollmentStatusDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollmentId: string;
  studentName: string;
};

export function EnrollmentStatusDialog({
  open,
  onOpenChange,
  enrollmentId,
  studentName,
}: EnrollmentStatusDialogProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Exclude<EnrollmentStatus, "enrolled">>("withdrawn");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatus("withdrawn");
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = await updateEnrollmentStatus(enrollmentId, status);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("เปลี่ยนสถานะแล้ว");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>เปลี่ยนสถานะการลงทะเบียน</DialogTitle>
            <DialogDescription>
              เปลี่ยนสถานะของ {studentName} — นักเรียนจะหายจากรายชื่อห้องเรียน
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>สถานะใหม่</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as Exclude<EnrollmentStatus, "enrolled">)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENROLLMENT_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" variant="destructive" disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

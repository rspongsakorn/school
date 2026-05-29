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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { moveStudentClassroom } from "@/lib/actions/enrollments";
import type { ClassroomWithGradeRow } from "@/lib/data/classrooms";

type MoveClassroomDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollmentId: string;
  studentName: string;
  currentClassroomId: string;
  classrooms: ClassroomWithGradeRow[];
  onSuccess?: () => void;
};

export function MoveClassroomDialog({
  open,
  onOpenChange,
  enrollmentId,
  studentName,
  currentClassroomId,
  classrooms,
  onSuccess,
}: MoveClassroomDialogProps) {
  const [selectedId, setSelectedId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const grouped = classrooms.reduce<Map<string, ClassroomWithGradeRow[]>>((acc, room) => {
    const list = acc.get(room.grade_name) ?? [];
    list.push(room);
    acc.set(room.grade_name, list);
    return acc;
  }, new Map());

  const selectItems = classrooms.map((room) => ({
    value: room.id,
    label: `${room.grade_name}/${room.name}`,
  }));

  useEffect(() => {
    if (!open) return;
    const firstOther = classrooms.find((c) => c.id !== currentClassroomId);
    setSelectedId(firstOther?.id ?? "");
  }, [open, classrooms, currentClassroomId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) {
      toast.error("กรุณาเลือกห้องเรียน");
      return;
    }
    if (selectedId === currentClassroomId) {
      toast.error("ห้องเรียนใหม่ต้องต่างจากห้องปัจจุบัน");
      return;
    }

    setSubmitting(true);
    const result = await moveStudentClassroom(enrollmentId, selectedId);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("ย้ายห้องเรียนแล้ว");
    onOpenChange(false);
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>ย้ายห้องเรียน</DialogTitle>
            <DialogDescription>ย้าย {studentName} ไปห้องเรียนใหม่</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>ห้องเรียนใหม่</Label>
              <Select
                value={selectedId}
                onValueChange={(value) => value && setSelectedId(value)}
                items={selectItems}
              >
                <SelectTrigger>
                  <SelectValue placeholder="เลือกห้องเรียน" />
                </SelectTrigger>
                <SelectContent>
                  {[...grouped.entries()].map(([gradeName, rooms]) => (
                    <SelectGroup key={gradeName}>
                      <SelectLabel>{gradeName}</SelectLabel>
                      {rooms.map((room) => (
                        <SelectItem
                          key={room.id}
                          value={room.id}
                          disabled={room.id === currentClassroomId}
                        >
                          {room.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "ย้ายห้อง"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

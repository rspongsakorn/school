"use client";

import { useEffect, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { enrollStudent, searchStudentsForEnrollment } from "@/lib/actions/enrollments";
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCandidates(initialCandidates);
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

  async function handleSelect(studentId: string) {
    setSubmitting(true);
    const result = await enrollStudent(studentId, classroomId);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("ลงทะเบียนนักเรียนแล้ว");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>เพิ่มนักเรียนในห้อง</DialogTitle>
          <DialogDescription>ค้นหารหัสหรือชื่อนักเรียนที่ยังไม่ได้ลงทะเบียนในภาคนี้</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="ค้นหารหัส ชื่อ หรือนามสกุล"
          />
          <div className="max-h-64 overflow-y-auto rounded-md border">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">กำลังค้นหา...</p>
            ) : candidates.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">ไม่พบนักเรียนที่เลือกได้</p>
            ) : (
              <ul>
                {candidates.map((student) => (
                  <li key={student.studentId} className="border-b last:border-b-0">
                    <button
                      type="button"
                      disabled={submitting}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
                      onClick={() => handleSelect(student.studentId)}
                    >
                      <span className="font-medium">{student.name}</span>
                      <span className="text-muted-foreground">{student.studentCode}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

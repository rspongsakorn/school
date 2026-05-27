"use client";

import { useEffect, useRef, useState } from "react";
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
  onSuccess?: () => void;
};

export function EnrollStudentDialog({
  open,
  onOpenChange,
  semesterId,
  classroomId,
  initialCandidates,
  onSuccess,
}: EnrollStudentDialogProps) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    onSuccess?.();
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
                        readOnly
                        tabIndex={-1}
                        aria-hidden="true"
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
            disabled={submitting}
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

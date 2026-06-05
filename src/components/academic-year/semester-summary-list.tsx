"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  SemesterDialog,
  type SemesterDialogInitial,
} from "@/components/academic-year/semester-dialog";
import { formatThaiDate } from "@/lib/format";
import { deleteSemester } from "@/lib/actions/semesters";
import type { SemesterRow } from "@/lib/data/academic-years";

type SemesterSummaryListProps = {
  academicYearId: string;
  yearStartDate: string;
  yearEndDate: string;
  semesters: SemesterRow[];
  addDialogOpen: boolean;
  onAddDialogOpenChange: (open: boolean) => void;
};

export function SemesterSummaryList({
  academicYearId,
  yearStartDate,
  yearEndDate,
  semesters,
  addDialogOpen,
  onAddDialogOpenChange,
}: SemesterSummaryListProps) {
  const queryClient = useQueryClient();
  const [editTarget, setEditTarget] = useState<SemesterDialogInitial | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SemesterRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sorted = [...semesters].sort((a, b) => a.number - b.number);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteSemester(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("ลบภาคเรียนแล้ว");
    void queryClient.invalidateQueries({ queryKey: ["academic-year", academicYearId] });
  }

  if (sorted.length === 0) {
    return (
      <>
        <p className="text-sm text-muted-foreground">ยังไม่มีภาคเรียน — กดเพิ่มภาคเรียน</p>
        <SemesterDialog
          open={addDialogOpen}
          onOpenChange={onAddDialogOpenChange}
          mode="create"
          academicYearId={academicYearId}
          yearStartDate={yearStartDate}
          yearEndDate={yearEndDate}
          existingSemesters={sorted}
        />
      </>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {sorted.map((semester) => (
          <li
            key={semester.id}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">ภาค {semester.number}</Badge>
                {semester.name ? (
                  <span className="text-sm font-medium">{semester.name}</span>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatThaiDate(semester.start_date)} – {formatThaiDate(semester.end_date)}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setEditTarget({
                    id: semester.id,
                    number: semester.number,
                    name: semester.name ?? "",
                    startDate: semester.start_date,
                    endDate: semester.end_date,
                  })
                }
              >
                <Pencil className="mr-1 h-4 w-4" />
                แก้ไข
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => setDeleteTarget(semester)}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                ลบ
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <SemesterDialog
        open={addDialogOpen}
        onOpenChange={onAddDialogOpenChange}
        mode="create"
        academicYearId={academicYearId}
        yearStartDate={yearStartDate}
        yearEndDate={yearEndDate}
        existingSemesters={sorted}
      />

      {editTarget && (
        <SemesterDialog
          open
          onOpenChange={(open) => !open && setEditTarget(null)}
          mode="edit"
          academicYearId={academicYearId}
          yearStartDate={yearStartDate}
          yearEndDate={yearEndDate}
          existingSemesters={sorted}
          initial={editTarget}
        />
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบภาคเรียน</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบภาคเรียนที่ {deleteTarget?.number} หรือไม่? ภาคที่มีข้อมูลในระบบจะลบไม่ได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "กำลังลบ..." : "ลบ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

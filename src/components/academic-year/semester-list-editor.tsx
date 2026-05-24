"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addSemester, deleteSemester, updateSemester } from "@/lib/actions/semesters";
import {
  validateSemesterForm,
  type SemesterFormErrors,
} from "@/lib/academic-year/form-validation";
import type { AcademicYearRow } from "@/lib/data/academic-years";

type SemesterListEditorProps = {
  year: AcademicYearRow;
};

type SemesterDraft = {
  id: string;
  number: number;
  name: string;
  startDate: string;
  endDate: string;
};

function toDraft(semester: AcademicYearRow["semesters"][number]): SemesterDraft {
  return {
    id: semester.id,
    number: semester.number,
    name: semester.name ?? "",
    startDate: semester.start_date,
    endDate: semester.end_date,
  };
}

export function SemesterListEditor({ year }: SemesterListEditorProps) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(() =>
    [...year.semesters].sort((a, b) => a.number - b.number).map(toDraft),
  );
  const [errorsById, setErrorsById] = useState<Record<string, SemesterFormErrors>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SemesterDraft | null>(null);

  async function handleSave(draft: SemesterDraft) {
    const validation = validateSemesterForm(draft, draft.number);
    if (!validation.ok) {
      setErrorsById((prev) => ({ ...prev, [draft.id]: validation.errors }));
      return;
    }

    setErrorsById((prev) => {
      const next = { ...prev };
      delete next[draft.id];
      return next;
    });
    setSavingId(draft.id);

    const result = await updateSemester(draft.id, {
      name: draft.name,
      startDate: draft.startDate,
      endDate: draft.endDate,
    });

    setSavingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`บันทึกภาค ${draft.number} แล้ว`);
    router.refresh();
  }

  async function handleAdd() {
    setAdding(true);
    const result = await addSemester(year.id);
    setAdding(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("เพิ่มภาคเรียนแล้ว");
    router.refresh();
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    const result = await deleteSemester(deleteTarget.id);
    setDeleteTarget(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("ลบภาคเรียนแล้ว");
    router.refresh();
  }

  function updateDraft(id: string, patch: Partial<SemesterDraft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">ภาคเรียน</h3>
        <Button type="button" size="sm" variant="outline" onClick={handleAdd} disabled={adding}>
          <Plus className="mr-1 h-4 w-4" />
          {adding ? "กำลังเพิ่ม..." : "เพิ่มภาคเรียน"}
        </Button>
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีภาคเรียน — กดเพิ่มภาคเรียน</p>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => {
            const errors = errorsById[draft.id];
            return (
              <div
                key={draft.id}
                className="rounded-lg border border-border p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">ภาคเรียนที่ {draft.number}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    title="ลบภาคเรียน"
                    onClick={() => setDeleteTarget(draft)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`sem-name-${draft.id}`}>ชื่อ (ไม่บังคับ)</Label>
                  <Input
                    id={`sem-name-${draft.id}`}
                    value={draft.name}
                    onChange={(e) => updateDraft(draft.id, { name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor={`sem-start-${draft.id}`}>วันที่เริ่ม</Label>
                    <Input
                      id={`sem-start-${draft.id}`}
                      type="date"
                      value={draft.startDate}
                      onChange={(e) => updateDraft(draft.id, { startDate: e.target.value })}
                      aria-invalid={Boolean(errors?.startDate)}
                    />
                    <FieldError message={errors?.startDate} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`sem-end-${draft.id}`}>วันที่สิ้นสุด</Label>
                    <Input
                      id={`sem-end-${draft.id}`}
                      type="date"
                      value={draft.endDate}
                      onChange={(e) => updateDraft(draft.id, { endDate: e.target.value })}
                      aria-invalid={Boolean(errors?.endDate)}
                    />
                    <FieldError message={errors?.endDate} />
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleSave(draft)}
                  disabled={savingId === draft.id}
                >
                  {savingId === draft.id ? "กำลังบันทึก..." : "บันทึกภาคนี้"}
                </Button>
              </div>
            );
          })}
        </div>
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
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
            >
              ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

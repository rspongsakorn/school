"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { deleteClassroom } from "@/lib/actions/classrooms";
import { deleteGradeLevel } from "@/lib/actions/grade-levels";
import type { ClassroomRow } from "@/lib/data/classrooms";
import type { GradeLevelRow } from "@/lib/data/grade-levels";
import type { AcademicYearOption } from "@/lib/enrollment/year-params";
import { YearSelect } from "@/components/registration/year-select";
import { GradeLevelDialog } from "@/components/registration/grade-level-dialog";
import { ClassroomDialog } from "@/components/registration/classroom-dialog";

type SetupPanelProps = {
  years: AcademicYearOption[];
  selectedYearId: string;
  grades: GradeLevelRow[];
  classrooms: ClassroomRow[];
  isAdmin: boolean;
  initialGradeId?: string;
};

export function SetupPanel({
  years,
  selectedYearId,
  grades,
  classrooms,
  isAdmin,
  initialGradeId,
}: SetupPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedGradeId = useMemo(() => {
    if (initialGradeId && grades.some((g) => g.id === initialGradeId)) return initialGradeId;
    return grades[0]?.id ?? null;
  }, [grades, initialGradeId]);

  const [gradeDialog, setGradeDialog] = useState<{
    mode: "create" | "edit";
    grade?: GradeLevelRow;
  } | null>(null);
  const [classroomDialog, setClassroomDialog] = useState<{
    mode: "create" | "edit";
    classroom?: ClassroomRow;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    { type: "grade"; id: string; name: string } | { type: "classroom"; id: string; name: string } | null
  >(null);

  function selectGrade(gradeId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", selectedYearId);
    params.set("grade", gradeId);
    router.push(`/registration/setup?${params.toString()}`);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const result =
      deleteTarget.type === "grade"
        ? await deleteGradeLevel(deleteTarget.id)
        : await deleteClassroom(deleteTarget.id);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("ลบแล้ว");
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <YearSelect years={years} selectedYearId={selectedYearId} basePath="/registration/setup" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>ชั้นเรียน</CardTitle>
              <CardDescription>{grades.length} ชั้น</CardDescription>
            </div>
            {isAdmin && (
              <Button size="sm" onClick={() => setGradeDialog({ mode: "create" })}>
                <Plus className="mr-1 h-4 w-4" />
                เพิ่มชั้น
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {grades.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ยังไม่มีชั้นเรียนในปีนี้
                {isAdmin && " — กดเพิ่มชั้นเพื่อเริ่มต้น"}
              </p>
            ) : (
              <ul className="space-y-1">
                {grades.map((grade) => {
                  const active = grade.id === selectedGradeId;
                  return (
                    <li key={grade.id}>
                      <div
                        className={cn(
                          "flex items-center justify-between rounded-lg px-3 py-2",
                          active ? "bg-primary/10" : "hover:bg-muted/50",
                        )}
                      >
                        <button
                          type="button"
                          className="flex-1 text-left text-sm font-medium"
                          onClick={() => selectGrade(grade.id)}
                        >
                          {grade.name}
                        </button>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setGradeDialog({ mode: "edit", grade })}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() =>
                                setDeleteTarget({ type: "grade", id: grade.id, name: grade.name })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>ห้องเรียน</CardTitle>
              <CardDescription>
                {!selectedGradeId
                  ? "เลือกชั้นเรียนทางซ้าย"
                  : `${classrooms.length} ห้อง`}
              </CardDescription>
            </div>
            {isAdmin && selectedGradeId && (
              <Button size="sm" onClick={() => setClassroomDialog({ mode: "create" })}>
                <Plus className="mr-1 h-4 w-4" />
                เพิ่มห้อง
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!selectedGradeId ? (
              <p className="text-sm text-muted-foreground">เลือกชั้นเรียนทางซ้ายเพื่อดูห้องเรียน</p>
            ) : classrooms.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ยังไม่มีห้องเรียนในชั้นนี้
                {isAdmin && " — กดเพิ่มห้องเพื่อเริ่มต้น"}
              </p>
            ) : (
              <ul className="space-y-1">
                {classrooms.map((classroom) => (
                  <li
                    key={classroom.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50"
                  >
                    <span className="text-sm font-medium">{classroom.name}</span>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            setClassroomDialog({ mode: "edit", classroom })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() =>
                            setDeleteTarget({
                              type: "classroom",
                              id: classroom.id,
                              name: classroom.name,
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {grades.length === 0 && (
        <p className="text-sm text-muted-foreground">
          ต้องการลงทะเบียนนักเรียน?{" "}
          <Link href="/registration" className="text-primary underline-offset-4 hover:underline">
            ไปหน้าลงทะเบียน
          </Link>
        </p>
      )}

      {isAdmin && selectedYearId && (
        <>
          <GradeLevelDialog
            open={gradeDialog?.mode === "create"}
            onOpenChange={(open) => !open && setGradeDialog(null)}
            mode="create"
            academicYearId={selectedYearId}
          />
          {gradeDialog?.mode === "edit" && gradeDialog.grade && (
            <GradeLevelDialog
              open
              onOpenChange={(open) => !open && setGradeDialog(null)}
              mode="edit"
              academicYearId={selectedYearId}
              initial={{
                id: gradeDialog.grade.id,
                name: gradeDialog.grade.name,
                sortOrder: gradeDialog.grade.sort_order,
              }}
            />
          )}
          {selectedGradeId && (
            <>
              <ClassroomDialog
                open={classroomDialog?.mode === "create"}
                onOpenChange={(open) => !open && setClassroomDialog(null)}
                mode="create"
                academicYearId={selectedYearId}
                gradeLevelId={selectedGradeId}
              />
              {classroomDialog?.mode === "edit" && classroomDialog.classroom && (
                <ClassroomDialog
                  open
                  onOpenChange={(open) => !open && setClassroomDialog(null)}
                  mode="edit"
                  academicYearId={selectedYearId}
                  gradeLevelId={selectedGradeId}
                  initial={{
                    id: classroomDialog.classroom.id,
                    name: classroomDialog.classroom.name,
                  }}
                />
              )}
            </>
          )}
        </>
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบ{deleteTarget?.type === "grade" ? "ชั้น" : "ห้อง"} &quot;{deleteTarget?.name}
              &quot; หรือไม่?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

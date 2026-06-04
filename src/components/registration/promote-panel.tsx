"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRequireRole } from "@/components/providers/auth-provider";
import { fetchAllSemesters } from "@/lib/queries/promotion";
import { executePromotion, getPromotionPreview } from "@/lib/actions/promotion";
import type { PromotionPlan } from "@/lib/data/promotion";

const GRADUATE = "__graduate__";
const SKIP = "__skip__";

function semesterLabel(s: { academic_year_name: string; number: number; name: string | null }) {
  const sem = s.name ? `ภาค ${s.number} (${s.name})` : `ภาค ${s.number}`;
  return `${s.academic_year_name} — ${sem}`;
}

export function PromotePanel() {
  useRequireRole(["admin"]);

  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [plan, setPlan] = useState<PromotionPlan | null>(null);
  const [gradeChoice, setGradeChoice] = useState<Record<string, string>>({});
  const [classroomChoice, setClassroomChoice] = useState<Record<string, string>>({});
  const [previewPending, startPreview] = useTransition();
  const [execPending, startExec] = useTransition();

  const { data: semesters = [] } = useQuery({
    queryKey: ["all-semesters"],
    queryFn: fetchAllSemesters,
  });

  function loadPreview() {
    if (!sourceId || !targetId) {
      toast.error("กรุณาเลือกภาคเรียนต้นทางและปลายทาง");
      return;
    }
    startPreview(async () => {
      const result = await getPromotionPreview(sourceId, targetId);
      if (!result.ok) {
        toast.error(result.error);
        setPlan(null);
        return;
      }
      setPlan(result.plan);
      const gc: Record<string, string> = {};
      const cc: Record<string, string> = {};
      for (const grade of result.plan.grades) {
        gc[grade.sourceGradeId] = grade.defaultTargetGradeId ?? GRADUATE;
        for (const room of grade.classrooms) {
          cc[room.sourceClassroomId] = room.defaultTargetClassroomId ?? SKIP;
        }
      }
      setGradeChoice(gc);
      setClassroomChoice(cc);
    });
  }

  const summary = useMemo(() => {
    if (!plan) return null;
    const enrollments: { studentId: string; targetClassroomId: string }[] = [];
    const graduateStudentIds: string[] = [];
    let needsClassroom = 0;
    let alreadyEnrolled = 0;

    for (const grade of plan.grades) {
      const target = gradeChoice[grade.sourceGradeId] ?? GRADUATE;
      for (const room of grade.classrooms) {
        for (const student of room.students) {
          if (student.alreadyInTarget) {
            alreadyEnrolled += 1;
            continue;
          }
          if (target === GRADUATE) {
            graduateStudentIds.push(student.studentId);
            continue;
          }
          const targetClassroomId = classroomChoice[room.sourceClassroomId];
          if (!targetClassroomId || targetClassroomId === SKIP) {
            needsClassroom += 1;
            continue;
          }
          enrollments.push({ studentId: student.studentId, targetClassroomId });
        }
      }
    }
    return { enrollments, graduateStudentIds, needsClassroom, alreadyEnrolled };
  }, [plan, gradeChoice, classroomChoice]);

  function runPromotion() {
    if (!plan || !summary) return;
    startExec(async () => {
      const result = await executePromotion({
        targetSemesterId: targetId,
        enrollments: summary.enrollments,
        graduateStudentIds: summary.graduateStudentIds,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `เลื่อนชั้นสำเร็จ — ลงทะเบียน ${result.enrolled} คน, จบการศึกษา ${result.graduated} คน, ข้าม ${result.skipped} คน`,
      );
      setPlan(null);
    });
  }

  return (
    <>
      <AppHeader title="เลื่อนชั้นขึ้นปีการศึกษา" basePath="/registration" />
      <main className="space-y-6 p-4 lg:p-6">
        <Link
          href="/registration"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}
        >
          <ArrowLeft className="h-4 w-4" /> กลับหน้าลงทะเบียน
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>เลือกภาคเรียน</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ภาคต้นทาง</p>
              <Select value={sourceId || null} onValueChange={(v) => setSourceId(v ?? "")}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="เลือกภาคต้นทาง" />
                </SelectTrigger>
                <SelectContent>
                  {semesters.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {semesterLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">ภาคปลายทาง</p>
              <Select value={targetId || null} onValueChange={(v) => setTargetId(v ?? "")}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="เลือกภาคปลายทาง" />
                </SelectTrigger>
                <SelectContent>
                  {semesters.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {semesterLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={loadPreview} disabled={previewPending}>
              {previewPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "สร้างแผนเลื่อนชั้น"}
            </Button>
          </CardContent>
        </Card>

        {plan && summary && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>จับคู่ชั้นเรียน</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ชั้นต้นทาง</TableHead>
                      <TableHead>นักเรียน</TableHead>
                      <TableHead>ชั้นปลายทาง</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.grades.map((grade) => {
                      const count = grade.classrooms.reduce(
                        (sum, r) => sum + r.students.length,
                        0,
                      );
                      return (
                        <TableRow key={grade.sourceGradeId}>
                          <TableCell>{grade.sourceGradeName}</TableCell>
                          <TableCell>{count} คน</TableCell>
                          <TableCell>
                            <Select
                              value={gradeChoice[grade.sourceGradeId] ?? GRADUATE}
                              onValueChange={(v) =>
                                setGradeChoice((prev) => ({
                                  ...prev,
                                  [grade.sourceGradeId]: v ?? GRADUATE,
                                }))
                              }
                            >
                              <SelectTrigger className="w-56">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={GRADUATE}>จบการศึกษา</SelectItem>
                                {plan.targetGrades.map((tg) => (
                                  <SelectItem key={tg.id} value={tg.id}>
                                    {tg.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>จับคู่ห้องเรียน</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {plan.grades.map((grade) => {
                  const target = gradeChoice[grade.sourceGradeId] ?? GRADUATE;
                  if (target === GRADUATE) return null;
                  const targetGrade = plan.targetGrades.find((tg) => tg.id === target);
                  return (
                    <div key={grade.sourceGradeId} className="space-y-2">
                      <p className="text-sm font-medium">
                        {grade.sourceGradeName} → {targetGrade?.name ?? "—"}
                      </p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ห้องต้นทาง</TableHead>
                            <TableHead>นักเรียน</TableHead>
                            <TableHead>ห้องปลายทาง</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {grade.classrooms.map((room) => (
                            <TableRow key={room.sourceClassroomId}>
                              <TableCell>{room.sourceClassroomName}</TableCell>
                              <TableCell>{room.students.length} คน</TableCell>
                              <TableCell>
                                <Select
                                  value={classroomChoice[room.sourceClassroomId] ?? SKIP}
                                  onValueChange={(v) =>
                                    setClassroomChoice((prev) => ({
                                      ...prev,
                                      [room.sourceClassroomId]: v ?? SKIP,
                                    }))
                                  }
                                >
                                  <SelectTrigger className="w-48">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={SKIP}>ข้าม</SelectItem>
                                    {(targetGrade?.classrooms ?? []).map((tc) => (
                                      <SelectItem key={tc.id} value={tc.id}>
                                        {tc.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                <p className="text-sm text-muted-foreground">
                  ย้าย {summary.enrollments.length} คน · จบการศึกษา{" "}
                  {summary.graduateStudentIds.length} คน · ต้องเลือกห้อง{" "}
                  {summary.needsClassroom} คน · ลงทะเบียนแล้ว {summary.alreadyEnrolled} คน
                </p>
                <AlertDialog>
                  <AlertDialogTrigger
                    className={cn(buttonVariants())}
                    disabled={execPending}
                  >
                    {execPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ยืนยันเลื่อนชั้น"}
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>ยืนยันการเลื่อนชั้น</AlertDialogTitle>
                      <AlertDialogDescription>
                        จะลงทะเบียนนักเรียน {summary.enrollments.length} คน และตั้งสถานะจบการศึกษา{" "}
                        {summary.graduateStudentIds.length} คน ดำเนินการต่อหรือไม่?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                      <AlertDialogAction onClick={runPromotion}>ยืนยัน</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </>
  );
}

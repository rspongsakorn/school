"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRightLeft, Copy, Pencil, Plus, Trash2, UserX } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteClassroom } from "@/lib/actions/classrooms";
import { deleteEnrollment } from "@/lib/actions/enrollments";
import { deleteGradeLevel } from "@/lib/actions/grade-levels";
import { enrollmentDeleteBlockedReason } from "@/lib/enrollment/enrollment-delete-eligibility";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { copySemesterStructure } from "@/lib/actions/semester-structure";
import { ENROLLMENT_STATUS_LABELS } from "@/lib/enrollment/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GradeLevelDialog } from "@/components/registration/grade-level-dialog";
import { ClassroomDialog } from "@/components/registration/classroom-dialog";
import { EnrollStudentDialog } from "@/components/registration/enroll-student-dialog";
import { MoveClassroomDialog } from "@/components/registration/move-classroom-dialog";
import { EnrollmentStatusDialog } from "@/components/registration/enrollment-status-dialog";
import { useAuth, useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import {
  fetchClassroomRoster,
  fetchEnrollmentCandidates,
  fetchSemestersWithGradeLevels,
  fetchClassroomsByGradeWithCount,
  fetchClassroomsBySemesterWithGrade,
  type EnrollmentRosterRow,
  type ClassroomRow,
  type ClassroomWithGradeRow,
} from "@/lib/queries/registration";
import { fetchGradeLevels, type GradeLevel } from "@/lib/queries/classrooms";
import { AppHeader } from "@/components/app-header";

export function RegistrationPanel() {
  useRequireRole(["admin", "finance"]);

  const { profile } = useAuth();
  const { ctx } = useSemesterContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const isAdmin = profile?.role === "admin";

  const [copyPending, startCopyTransition] = useTransition();
  const [copySourceId, setCopySourceId] = useState("");
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [gradeCreateOpen, setGradeCreateOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState<GradeLevel | null>(null);
  const [classroomCreateOpen, setClassroomCreateOpen] = useState(false);
  const [editingClassroom, setEditingClassroom] = useState<ClassroomRow | null>(null);
  const [moveTarget, setMoveTarget] = useState<EnrollmentRosterRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<EnrollmentRosterRow | null>(null);
  const [enrollmentRemoveTarget, setEnrollmentRemoveTarget] = useState<EnrollmentRosterRow | null>(
    null,
  );
  const [removingEnrollment, setRemovingEnrollment] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    { type: "grade"; id: string; name: string } | { type: "classroom"; id: string; name: string } | null
  >(null);

  const semesterId = ctx?.semesterId ?? null;
  const semesterNumber = ctx?.semesterNumber ?? 1;
  const academicYearId = ctx?.academicYearId ?? null;

  const { data: grades = [] } = useQuery({
    queryKey: ["grade-levels", semesterId],
    queryFn: () => fetchGradeLevels(semesterId!),
    enabled: Boolean(semesterId),
  });

  const gradeParam = searchParams.get("grade");
  const selectedGradeId = gradeParam && grades.some((g) => g.id === gradeParam)
    ? gradeParam
    : grades[0]?.id ?? null;

  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms-by-grade", selectedGradeId],
    queryFn: () => fetchClassroomsByGradeWithCount(selectedGradeId!),
    enabled: Boolean(selectedGradeId),
  });

  const classroomParam = searchParams.get("classroom");
  const selectedClassroomId = classroomParam && classrooms.some((c) => c.id === classroomParam)
    ? classroomParam
    : classrooms[0]?.id ?? null;

  const { data: roster = [] } = useQuery({
    queryKey: ["classroom-roster", selectedClassroomId],
    queryFn: () => fetchClassroomRoster(selectedClassroomId!),
    enabled: Boolean(selectedClassroomId),
  });

  const { data: enrollCandidates = [] } = useQuery({
    queryKey: ["enrollment-candidates", semesterId],
    queryFn: () => fetchEnrollmentCandidates(semesterId!),
    enabled: Boolean(semesterId),
  });

  const { data: allClassrooms = [] } = useQuery({
    queryKey: ["classrooms-by-semester", semesterId],
    queryFn: () => fetchClassroomsBySemesterWithGrade(semesterId!),
    enabled: Boolean(semesterId),
  });

  const { data: sourceSemesters = [] } = useQuery({
    queryKey: ["semesters-with-grade-levels", academicYearId],
    queryFn: () => fetchSemestersWithGradeLevels(academicYearId!),
    enabled: Boolean(academicYearId),
  });

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ["grade-levels", semesterId] });
    void queryClient.invalidateQueries({ queryKey: ["classrooms-by-grade", selectedGradeId] });
    void queryClient.invalidateQueries({ queryKey: ["classroom-roster", selectedClassroomId] });
    void queryClient.invalidateQueries({ queryKey: ["enrollment-candidates", semesterId] });
    void queryClient.invalidateQueries({ queryKey: ["classrooms-by-semester", semesterId] });
    void queryClient.invalidateQueries({ queryKey: ["semesters-with-grade-levels", academicYearId] });
  }

  async function handleRemoveEnrollment() {
    if (!enrollmentRemoveTarget) return;

    setRemovingEnrollment(true);
    const result = await deleteEnrollment(enrollmentRemoveTarget.enrollmentId);
    setRemovingEnrollment(false);
    setEnrollmentRemoveTarget(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("ลบออกจากห้องแล้ว");
    void queryClient.invalidateQueries({ queryKey: ["classroom-roster", selectedClassroomId] });
    void queryClient.invalidateQueries({ queryKey: ["enrollment-candidates", semesterId] });
    void queryClient.invalidateQueries({ queryKey: ["classrooms-by-grade", selectedGradeId] });
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    const result =
      deleteTarget.type === "grade"
        ? await deleteGradeLevel(deleteTarget.id)
        : await deleteClassroom(deleteTarget.id);

    if (!result.ok) {
      toast.error(result.error);
      setDeleteTarget(null);
      return;
    }

    toast.success("ลบแล้ว");
    setDeleteTarget(null);

    if (deleteTarget.type === "grade" && deleteTarget.id === selectedGradeId) {
      router.push(buildUrl({ grade: null, classroom: null }));
    } else if (deleteTarget.type === "classroom" && deleteTarget.id === selectedClassroomId) {
      router.push(buildUrl({ classroom: null }));
    } else {
      invalidateAll();
    }
  }

  function buildUrl(updates: { grade?: string | null; classroom?: string | null }) {
    const params = new URLSearchParams(searchParams.toString());
    if (academicYearId) params.set("year", academicYearId);
    params.set("semester", String(semesterNumber));
    params.delete("view");
    if (updates.grade !== undefined) {
      if (updates.grade) params.set("grade", updates.grade);
      else params.delete("grade");
    }
    if (updates.classroom !== undefined) {
      if (updates.classroom) params.set("classroom", updates.classroom);
      else params.delete("classroom");
    }
    return `/registration?${params.toString()}`;
  }

  function selectGrade(gradeId: string) {
    router.push(buildUrl({ grade: gradeId, classroom: null }));
  }

  function selectClassroom(classroomId: string) {
    router.push(buildUrl({ classroom: classroomId }));
  }

  const selectedClassroom = classrooms.find((c) => c.id === selectedClassroomId);
  const selectedGrade = grades.find((g) => g.id === selectedGradeId);

  const copySourceOptions = sourceSemesters
    .filter((s) => s.id !== semesterId)
    .sort((a, b) => a.number - b.number)
    .map((s) => ({
      value: s.id,
      label: s.name ? `ภาค ${s.number} (${s.name})` : `ภาค ${s.number}`,
    }));

  function handleCopyStructure() {
    if (!copySourceId) {
      toast.error("กรุณาเลือกภาคเรียนต้นทาง");
      return;
    }
    if (!semesterId) return;
    startCopyTransition(async () => {
      const result = await copySemesterStructure(copySourceId, semesterId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("คัดลอกโครงสร้างแล้ว");
      invalidateAll();
    });
  }

  if (!ctx) {
    return (
      <>
        <AppHeader title="ลงทะเบียน" basePath="/registration" clearGradeClassroomOnChange={true} />
        <main className="p-4 lg:p-6">
          <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษาในระบบ</p>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader title="ลงทะเบียน" basePath="/registration" clearGradeClassroomOnChange={true} />
      <main className="p-4 lg:p-6">
        <div className="space-y-6">
          {isAdmin && grades.length === 0 && copySourceOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                ภาค {semesterNumber} ยังไม่มีชั้นเรียน — คัดลอกโครงสร้างจากภาคอื่น (ไม่รวมนักเรียน)
              </p>
              <Select
                value={copySourceId || null}
                onValueChange={(id) => setCopySourceId(id ?? "")}
                items={copySourceOptions}
              >
                <SelectTrigger className="h-9 w-[200px] bg-background">
                  <SelectValue placeholder="เลือกภาคต้นทาง" />
                </SelectTrigger>
                <SelectContent>
                  {copySourceOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={copyPending || !copySourceId}
                onClick={handleCopyStructure}
              >
                <Copy className="mr-1 h-4 w-4" />
                {copyPending ? "กำลังคัดลอก..." : "คัดลอกโครงสร้าง"}
              </Button>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[200px_200px_1fr]">
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base">ชั้นเรียน</CardTitle>
                {isAdmin && (
                  <Button size="sm" variant="outline" onClick={() => setGradeCreateOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    เพิ่ม
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0 pb-2">
                {grades.length === 0 ? (
                  <p className="px-4 py-2 text-sm text-muted-foreground">
                    ยังไม่มีชั้นเรียนในปีนี้
                    {isAdmin && " — กดเพิ่มชั้นเรียนเพื่อเริ่มต้น"}
                  </p>
                ) : (
                  <ul>
                    {grades.map((grade) => (
                      <li key={grade.id}>
                        <div
                          className={cn(
                            "flex items-center justify-between gap-1",
                            grade.id === selectedGradeId ? "bg-primary/10" : "hover:bg-muted/50",
                          )}
                        >
                          <button
                            type="button"
                            className={cn(
                              "min-w-0 flex-1 px-4 py-2 text-left text-sm",
                              grade.id === selectedGradeId && "font-medium",
                            )}
                            onClick={() => selectGrade(grade.id)}
                          >
                            {grade.name}
                          </button>
                          {isAdmin && (
                            <div className="mr-1 flex shrink-0 gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="แก้ไขชั้นเรียน"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingGrade(grade);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                title="ลบชั้นเรียน"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget({ type: "grade", id: grade.id, name: grade.name });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base">ห้องเรียน</CardTitle>
                {isAdmin && selectedGradeId && (
                  <Button size="sm" variant="outline" onClick={() => setClassroomCreateOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    เพิ่ม
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0 pb-2">
                {!selectedGradeId ? (
                  <p className="px-4 py-2 text-sm text-muted-foreground">เลือกชั้นเรียนก่อน</p>
                ) : classrooms.length === 0 ? (
                  <p className="px-4 py-2 text-sm text-muted-foreground">
                    ยังไม่มีห้อง
                    {isAdmin && " — กดเพิ่มห้องเรียนเพื่อเริ่มต้น"}
                  </p>
                ) : (
                  <ul>
                    {classrooms.map((classroom) => (
                      <li key={classroom.id}>
                        <div
                          className={cn(
                            "flex items-center gap-1",
                            classroom.id === selectedClassroomId
                              ? "bg-primary/10"
                              : "hover:bg-muted/50",
                          )}
                        >
                          <button
                            type="button"
                            className={cn(
                              "flex min-w-0 flex-1 items-center justify-between gap-2 px-4 py-2 text-left text-sm",
                              classroom.id === selectedClassroomId && "font-medium",
                            )}
                            onClick={() => selectClassroom(classroom.id)}
                          >
                            <span>{classroom.name}</span>
                            <Badge variant="secondary" className="shrink-0">
                              {classroom.enrolled_count}
                            </Badge>
                          </button>
                          {isAdmin && (
                            <div className="mr-1 flex shrink-0 gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="แก้ไขห้องเรียน"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingClassroom(classroom);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                title="ลบห้องเรียน"
                                disabled={classroom.enrolled_count > 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget({
                                    type: "classroom",
                                    id: classroom.id,
                                    name: classroom.name,
                                  });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    {selectedClassroom ? `ห้อง ${selectedClassroom.name}` : "รายชื่อในห้อง"}
                  </CardTitle>
                  <CardDescription>{roster.length} คน</CardDescription>
                </div>
                {isAdmin && selectedClassroomId && (
                  <Button size="sm" onClick={() => setEnrollOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    เพิ่มนักเรียน
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!selectedClassroomId ? (
                  <p className="text-sm text-muted-foreground">เลือกห้องเรียนเพื่อดูรายชื่อ</p>
                ) : roster.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    ยังไม่มีนักเรียนในห้องนี้
                    {isAdmin && " — กดเพิ่มนักเรียนเพื่อลงทะเบียน"}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>รหัส</TableHead>
                        <TableHead>ชื่อ-นามสกุล</TableHead>
                        <TableHead>สถานะ</TableHead>
                        {isAdmin && <TableHead className="w-[168px]">จัดการ</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roster.map((row) => {
                        const blockedReason = enrollmentDeleteBlockedReason({
                          status: row.status,
                          hasInvoiceInSemester: !row.deletable,
                        });
                        return (
                          <TableRow key={row.enrollmentId}>
                            <TableCell className="font-mono text-sm">{row.studentCode}</TableCell>
                            <TableCell>{row.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {ENROLLMENT_STATUS_LABELS[row.status]}
                              </Badge>
                            </TableCell>
                            {isAdmin && (
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title="ย้ายห้อง"
                                    onClick={() => setMoveTarget(row)}
                                  >
                                    <ArrowRightLeft className="h-4 w-4" />
                                  </Button>
                                  {row.deletable ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive"
                                      title="ลบออกจากห้อง"
                                      onClick={() => setEnrollmentRemoveTarget(row)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  ) : null}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive"
                                    title={blockedReason ?? "เปลี่ยนสถานะ"}
                                    onClick={() => setStatusTarget(row)}
                                  >
                                    <UserX className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {isAdmin && (
            <>
              <GradeLevelDialog
                open={gradeCreateOpen}
                onOpenChange={setGradeCreateOpen}
                mode="create"
                semesterId={semesterId ?? ""}
                onSuccess={() => {
                  void queryClient.invalidateQueries({ queryKey: ["grade-levels", semesterId] });
                  void queryClient.invalidateQueries({ queryKey: ["classrooms-by-grade", selectedGradeId] });
                }}
              />
              {editingGrade && (
                <GradeLevelDialog
                  open
                  onOpenChange={(open) => !open && setEditingGrade(null)}
                  mode="edit"
                  semesterId={semesterId ?? ""}
                  initial={{
                    id: editingGrade.id,
                    name: editingGrade.name,
                    sortOrder: editingGrade.sort_order,
                  }}
                  onSuccess={() => {
                    void queryClient.invalidateQueries({ queryKey: ["grade-levels", semesterId] });
                    void queryClient.invalidateQueries({ queryKey: ["classrooms-by-grade", selectedGradeId] });
                  }}
                />
              )}
              {selectedGradeId && (
                <ClassroomDialog
                  open={classroomCreateOpen}
                  onOpenChange={setClassroomCreateOpen}
                  mode="create"
                  semesterId={semesterId ?? ""}
                  gradeLevelId={selectedGradeId}
                  gradeName={selectedGrade?.name ?? ""}
                  onSuccess={() => {
                    void queryClient.invalidateQueries({ queryKey: ["classrooms-by-grade", selectedGradeId] });
                    void queryClient.invalidateQueries({ queryKey: ["classrooms-by-semester", semesterId] });
                  }}
                />
              )}
              {editingClassroom && selectedGradeId && (
                <ClassroomDialog
                  open
                  onOpenChange={(open) => !open && setEditingClassroom(null)}
                  mode="edit"
                  semesterId={semesterId ?? ""}
                  gradeLevelId={selectedGradeId}
                  gradeName={selectedGrade?.name ?? ""}
                  initial={{
                    id: editingClassroom.id,
                    name: editingClassroom.name,
                  }}
                  onSuccess={() => {
                    void queryClient.invalidateQueries({ queryKey: ["classrooms-by-grade", selectedGradeId] });
                    void queryClient.invalidateQueries({ queryKey: ["classrooms-by-semester", semesterId] });
                  }}
                />
              )}
            </>
          )}

          {isAdmin && selectedClassroomId && (
            <EnrollStudentDialog
              open={enrollOpen}
              onOpenChange={setEnrollOpen}
              semesterId={semesterId ?? ""}
              classroomId={selectedClassroomId}
              initialCandidates={enrollCandidates}
              onSuccess={() => {
                void queryClient.invalidateQueries({ queryKey: ["classroom-roster", selectedClassroomId] });
                void queryClient.invalidateQueries({ queryKey: ["enrollment-candidates", semesterId] });
                void queryClient.invalidateQueries({ queryKey: ["classrooms-by-grade", selectedGradeId] });
              }}
            />
          )}

          {moveTarget && selectedClassroomId && (
            <MoveClassroomDialog
              open={Boolean(moveTarget)}
              onOpenChange={(open) => !open && setMoveTarget(null)}
              enrollmentId={moveTarget.enrollmentId}
              studentName={moveTarget.name}
              currentClassroomId={selectedClassroomId}
              classrooms={allClassrooms}
              onSuccess={() => {
                void queryClient.invalidateQueries({ queryKey: ["classroom-roster", selectedClassroomId] });
                void queryClient.invalidateQueries({ queryKey: ["classrooms-by-grade", selectedGradeId] });
              }}
            />
          )}

          {statusTarget && (
            <EnrollmentStatusDialog
              open={Boolean(statusTarget)}
              onOpenChange={(open) => !open && setStatusTarget(null)}
              enrollmentId={statusTarget.enrollmentId}
              studentName={statusTarget.name}
              onSuccess={() => {
                void queryClient.invalidateQueries({ queryKey: ["classroom-roster", selectedClassroomId] });
              }}
            />
          )}

          <AlertDialog
            open={Boolean(enrollmentRemoveTarget)}
            onOpenChange={(open) => !open && !removingEnrollment && setEnrollmentRemoveTarget(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ลบออกจากห้อง</AlertDialogTitle>
                <AlertDialogDescription>
                  ลบการลงทะเบียนของ {enrollmentRemoveTarget?.name} ออกจากห้องนี้ — นักเรียนยังอยู่ในระบบและสามารถลงทะเบียนใหม่ได้
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={removingEnrollment}>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={handleRemoveEnrollment}
                  disabled={removingEnrollment}
                >
                  {removingEnrollment ? "กำลังลบ..." : "ยืนยันลบ"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
                <AlertDialogDescription>
                  ต้องการลบ{deleteTarget?.type === "grade" ? "ชั้นเรียน" : "ห้องเรียน"} &quot;
                  {deleteTarget?.name}&quot; หรือไม่?
                  {deleteTarget?.type === "grade"
                    ? " ชั้นที่มีนักเรียนลงทะเบียนหรือมีห้องเรียนจะลบไม่ได้"
                    : " ห้องที่มีนักเรียนลงทะเบียนจะลบไม่ได้"}
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
      </main>
    </>
  );
}

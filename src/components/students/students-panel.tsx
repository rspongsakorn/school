"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import type { StudentListRow } from "@/lib/data/students";
import { deleteAllStudents, deleteStudents } from "@/lib/actions/students";
import {
  STUDENT_STATUS_FILTER_OPTIONS,
  type StudentStatus,
} from "@/lib/students/constants";
import { studentDeleteBlockedReason } from "@/lib/students/delete-eligibility";
import { StudentImportDialog } from "@/components/students/student-import-dialog";
import { StudentSheet } from "@/components/students/student-sheet";
import { StudentSearchInput } from "@/components/students/student-search-input";
import { AppHeader } from "@/components/app-header";
import { useAuth } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchStudentsPaginated } from "@/lib/queries/students";
import { cn } from "@/lib/utils";

function parseStatus(value?: string): StudentStatus | "all" {
  if (!value) return "all";
  const isValid = STUDENT_STATUS_FILTER_OPTIONS.some((option) => option.value === value);
  return isValid ? (value as StudentStatus | "all") : "all";
}

function statusBadgeClass(status: StudentStatus) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  if (status === "graduated") return "bg-blue-50 text-blue-700 hover:bg-blue-50";
  if (status === "transferred") return "bg-amber-50 text-amber-700 hover:bg-amber-50";
  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
}

export function StudentsPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const rawSearchParams = useSearchParams();
  const { profile } = useAuth();
  const { ctx } = useSemesterContext();
  const isAdmin = profile?.role === "admin";

  const q = rawSearchParams.get("q") ?? "";
  const status = parseStatus(rawSearchParams.get("status") ?? undefined);
  const rawPage = Number.parseInt(rawSearchParams.get("page") ?? "1", 10);
  const pageNum = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const params = { q, status, page: pageNum };

  const { data, isLoading } = useQuery({
    queryKey: ["students", ctx?.semesterId ?? null, q, status, pageNum],
    queryFn: () =>
      fetchStudentsPaginated({ q, status, page: pageNum, semesterId: ctx?.semesterId ?? null }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentListRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);
  const [isNavigating, startTransition] = useTransition();

  const deletableRows = useMemo(
    () => (data?.rows ?? []).filter((row) => row.deletable),
    [data?.rows],
  );

  const allDeletableSelected =
    deletableRows.length > 0 && deletableRows.every((row) => selectedIds.has(row.id));

  useEffect(() => {
    startTransition(() => setSelectedIds(new Set()));
  }, [data?.page, q, status]);

  const pushParams = useCallback(
    (next: { q?: string; status?: string; page?: number }) => {
      const nextQ = (next.q ?? q).trim();
      const nextStatus = next.status ?? status;
      const nextPage = next.page ?? pageNum;
      const query = new URLSearchParams();

      if (nextQ) query.set("q", nextQ);
      if (nextStatus && nextStatus !== "all") query.set("status", nextStatus);
      query.set("page", String(Math.max(1, nextPage)));

      const yearSemester = new URLSearchParams(window.location.search);
      if (yearSemester.get("year")) query.set("year", yearSemester.get("year")!);
      if (yearSemester.get("semester")) query.set("semester", yearSemester.get("semester")!);

      const queryString = query.toString();
      startTransition(() => {
        router.push(queryString ? `${pathname}?${queryString}` : pathname);
      });
    },
    [pageNum, q, status, pathname, router, startTransition],
  );

  const handleDebouncedSearch = useCallback(
    (query: string) => {
      pushParams({ q: query, page: 1 });
    },
    [pushParams],
  );

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(deletableRows.map((row) => row.id)));
  }

  async function confirmDelete() {
    if (!deleteTargetIds || deleteTargetIds.length === 0) return;

    setDeleting(true);
    const result = await deleteStudents(deleteTargetIds);
    setDeleting(false);
    setDeleteTargetIds(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of deleteTargetIds) next.delete(id);
      return next;
    });

    if (selectedStudent && deleteTargetIds.includes(selectedStudent.id)) {
      setSelectedStudent(null);
    }

    if (result.skipped > 0) {
      toast.success(`ลบแล้ว ${result.deleted} คน (ข้าม ${result.skipped} คนที่ลบไม่ได้)`);
    } else {
      toast.success(`ลบนักเรียนแล้ว ${result.deleted} คน`);
    }
    void queryClient.invalidateQueries({ queryKey: ["students"] });
    void queryClient.invalidateQueries({ queryKey: ["enrollment-candidates"] });
    void queryClient.invalidateQueries({ queryKey: ["classroom-roster"] });
    void queryClient.invalidateQueries({ queryKey: ["classrooms-by-grade"] });
    router.refresh();
  }

  async function handleDeleteAll() {
    setDeletingAll(true);
    const result = await deleteAllStudents();
    setDeletingAll(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setDeleteAllOpen(false);
    setDeleteAllConfirmText(""); // explicit clear, not relying on onOpenChange timing
    if (result.skipped > 0) {
      toast.success(`ลบแล้ว ${result.deleted} คน (ข้าม ${result.skipped} คนที่ลบไม่ได้)`);
    } else {
      toast.success(`ลบนักเรียนแล้ว ${result.deleted} คน`);
    }
    void queryClient.invalidateQueries({ queryKey: ["students"] });
    void queryClient.invalidateQueries({ queryKey: ["enrollment-candidates"] });
    void queryClient.invalidateQueries({ queryKey: ["classroom-roster"] });
    void queryClient.invalidateQueries({ queryKey: ["classrooms-by-grade"] });
    router.refresh();
  }

  const canPrev = (data?.page ?? 1) > 1;
  const canNext = (data?.page ?? 1) < (data?.totalPages ?? 1);
  const sheetOpen = createOpen || Boolean(selectedStudent);
  const sheetMode = createOpen ? "create" : "edit";
  const bulkDeleteCount = selectedIds.size;

  const selectedInitial = useMemo(() => {
    if (!selectedStudent) return undefined;
    return {
      id: selectedStudent.id,
      studentCode: selectedStudent.studentCode,
      firstName: selectedStudent.firstName,
      lastName: selectedStudent.lastName,
      idCard: selectedStudent.idCard,
      gender: selectedStudent.gender,
      dateOfBirth: selectedStudent.dateOfBirth,
      status: selectedStudent.statusRaw,
      deletable: selectedStudent.deletable,
    };
  }, [selectedStudent]);

  function handleSheetChange(open: boolean) {
    if (open) return;
    setCreateOpen(false);
    setSelectedStudent(null);
  }

  return (
    <>
      <AppHeader title="นักเรียน" basePath="/students" />
      <main className="p-4 lg:p-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>รายชื่อนักเรียน</CardTitle>
            <CardDescription>
              {data && data.total > 0 ? `${data.total} คน` : "ยังไม่มีนักเรียนในระบบ"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={cn("space-y-4 transition-opacity", isNavigating && "pointer-events-none opacity-60")}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                  <StudentSearchInput
                    key={q}
                    initialQuery={q}
                    onDebouncedChange={handleDebouncedSearch}
                  />
                  <Select
                    value={params.status}
                    onValueChange={(value) => pushParams({ status: value ?? "all", page: 1 })}
                    items={STUDENT_STATUS_FILTER_OPTIONS}
                  >
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="สถานะ" />
                    </SelectTrigger>
                    <SelectContent>
                      {STUDENT_STATUS_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isAdmin ? (
                  <div className="flex flex-wrap gap-2">
                    {bulkDeleteCount > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => setDeleteTargetIds([...selectedIds])}
                      >
                        ลบที่เลือก ({bulkDeleteCount})
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => setDeleteAllOpen(true)}
                    >
                      ลบนักเรียนทั้งหมด
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
                      นำเข้า CSV
                    </Button>
                    <Button type="button" onClick={() => setCreateOpen(true)}>
                      เพิ่มนักเรียน
                    </Button>
                  </div>
                ) : null}
              </div>

              {isLoading && !data ? (
                <div className="h-40 animate-pulse rounded-lg bg-muted" />
              ) : data ? (
                <>
                  {/* Mobile stacked cards */}
                  {data.rows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground sm:hidden">
                      ไม่พบข้อมูลนักเรียน
                    </p>
                  ) : (
                    <div className="sm:hidden divide-y divide-border rounded-lg border border-border">
                      {data.rows.map((student) => (
                        <div
                          key={student.id}
                          className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3 hover:bg-muted/50"
                          onClick={() => setSelectedStudent(student)}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{student.name}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                              {student.studentCode} · {student.grade}
                            </p>
                          </div>
                          <Badge className={statusBadgeClass(student.statusRaw)}>
                            {student.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Desktop table */}
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {isAdmin ? (
                            <TableHead className="w-10">
                              <input
                                type="checkbox"
                                className="size-4 rounded border-border"
                                checked={allDeletableSelected}
                                disabled={deletableRows.length === 0}
                                aria-label="เลือกทั้งหมดที่ลบได้"
                                onChange={(e) => toggleSelectAll(e.target.checked)}
                              />
                            </TableHead>
                          ) : null}
                          <TableHead>รหัส</TableHead>
                          <TableHead>ชื่อ-นามสกุล</TableHead>
                          <TableHead>เลขบัตร</TableHead>
                          <TableHead>ชั้น</TableHead>
                          <TableHead>สถานะ</TableHead>
                          {isAdmin ? <TableHead className="w-[100px]" /> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.rows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={isAdmin ? 7 : 5}
                              className="py-6 text-center text-muted-foreground"
                            >
                              ไม่พบข้อมูลนักเรียน
                            </TableCell>
                          </TableRow>
                        ) : (
                          data.rows.map((student) => {
                            const blockedReason = studentDeleteBlockedReason(!student.deletable);
                            return (
                              <TableRow
                                key={student.id}
                                className="cursor-pointer"
                                onClick={() => setSelectedStudent(student)}
                              >
                                {isAdmin ? (
                                  <TableCell onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      className="size-4 rounded border-border"
                                      checked={selectedIds.has(student.id)}
                                      disabled={!student.deletable}
                                      title={blockedReason ?? undefined}
                                      aria-label={`เลือก ${student.studentCode}`}
                                      onChange={(e) => toggleRow(student.id, e.target.checked)}
                                    />
                                  </TableCell>
                                ) : null}
                                <TableCell className="font-medium tabular-nums">{student.studentCode}</TableCell>
                                <TableCell>{student.name}</TableCell>
                                <TableCell>{student.idCard ?? "—"}</TableCell>
                                <TableCell>{student.grade}</TableCell>
                                <TableCell>
                                  <Badge className={statusBadgeClass(student.statusRaw)}>
                                    {student.status}
                                  </Badge>
                                </TableCell>
                                {isAdmin ? (
                                  <TableCell onClick={(e) => e.stopPropagation()}>
                                    {student.deletable ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="text-destructive"
                                        onClick={() => setDeleteTargetIds([student.id])}
                                      >
                                        ลบ
                                      </Button>
                                    ) : blockedReason ? (
                                      <span
                                        className="text-xs text-muted-foreground"
                                        title={blockedReason}
                                      >
                                        ลบไม่ได้
                                      </span>
                                    ) : null}
                                  </TableCell>
                                ) : null}
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <p className="text-muted-foreground">
                      {data.total > 0
                        ? `หน้า ${data.page} จาก ${Math.max(data.totalPages, 1)} (${data.total} คน)`
                        : "0 คน"}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => pushParams({ page: pageNum - 1 })}
                        disabled={!canPrev}
                      >
                        ก่อนหน้า
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => pushParams({ page: pageNum + 1 })}
                        disabled={!canNext}
                      >
                        ถัดไป
                      </Button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </main>

      <StudentSheet
        open={sheetOpen}
        onOpenChange={handleSheetChange}
        mode={sheetMode}
        readOnly={!isAdmin}
        initial={selectedInitial}
      />

      {isAdmin ? (
        <StudentImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          semesterId={ctx?.semesterId ?? null}
          semesterLabel={
            ctx ? `ภาคเรียนที่ ${ctx.semesterNumber}/${ctx.academicYearName}` : null
          }
        />
      ) : null}

      {isAdmin ? (
        <AlertDialog
          open={Boolean(deleteTargetIds)}
          onOpenChange={(open) => !open && !deleting && setDeleteTargetIds(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ลบนักเรียน</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTargetIds && deleteTargetIds.length > 1
                  ? `ยืนยันลบ ${deleteTargetIds.length} คน — เฉพาะรายที่ไม่มีประวัติการลงทะเบียนหรือการเงินจะถูกลบ`
                  : "ยืนยันลบนักเรียนนี้ — การลบไม่สามารถย้อนกลับได้"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "กำลังลบ..." : "ยืนยันลบ"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {isAdmin ? (
        <Dialog
          open={deleteAllOpen}
          onOpenChange={(open) => {
            if (!open && !deletingAll) {
              setDeleteAllOpen(false);
              setDeleteAllConfirmText("");
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>ลบนักเรียนทั้งหมด</DialogTitle>
              <DialogDescription>
                การลบไม่สามารถย้อนกลับได้ นักเรียนที่มีประวัติการลงทะเบียนหรือการเงินจะถูกข้าม
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Input
                aria-label='พิมพ์ "ลบทั้งหมด" เพื่อยืนยัน'
                value={deleteAllConfirmText}
                onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                placeholder='พิมพ์ "ลบทั้งหมด" เพื่อยืนยัน'
                disabled={deletingAll}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={deletingAll}
                onClick={() => {
                  setDeleteAllOpen(false);
                  setDeleteAllConfirmText("");
                }}
              >
                ยกเลิก
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteAllConfirmText !== "ลบทั้งหมด" || deletingAll}
                onClick={handleDeleteAll}
              >
                {deletingAll ? "กำลังลบ..." : "ยืนยันลบ"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

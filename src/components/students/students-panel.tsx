"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import type { PaginatedStudents, StudentListRow } from "@/lib/data/students";
import { deleteStudents } from "@/lib/actions/students";
import {
  STUDENT_STATUS_FILTER_OPTIONS,
  type StudentStatus,
} from "@/lib/students/constants";
import { studentDeleteBlockedReason } from "@/lib/students/delete-eligibility";
import { StudentSheet } from "@/components/students/student-sheet";
import { StudentSearchInput } from "@/components/students/student-search-input";

type StudentsPanelProps = {
  data: PaginatedStudents;
  params: { q: string; status: string; page: number };
  isAdmin: boolean;
};

function statusBadgeClass(status: StudentStatus) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  if (status === "graduated") return "bg-blue-50 text-blue-700 hover:bg-blue-50";
  if (status === "transferred") return "bg-amber-50 text-amber-700 hover:bg-amber-50";
  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
}

export function StudentsPanel({ data, params, isAdmin }: StudentsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentListRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deletableRows = useMemo(
    () => data.rows.filter((row) => row.deletable),
    [data.rows],
  );

  const allDeletableSelected =
    deletableRows.length > 0 && deletableRows.every((row) => selectedIds.has(row.id));

  useEffect(() => {
    setSelectedIds(new Set());
  }, [data.page, params.q, params.status]);

  const pushParams = useCallback(
    (next: { q?: string; status?: string; page?: number }) => {
      const q = (next.q ?? params.q).trim();
      const status = next.status ?? params.status;
      const page = next.page ?? params.page;
      const query = new URLSearchParams();

      if (q) query.set("q", q);
      if (status && status !== "all") query.set("status", status);
      query.set("page", String(Math.max(1, page)));

      const yearSemester = new URLSearchParams(window.location.search);
      if (yearSemester.get("year")) query.set("year", yearSemester.get("year")!);
      if (yearSemester.get("semester")) query.set("semester", yearSemester.get("semester")!);

      const queryString = query.toString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [params.page, params.q, params.status, pathname, router],
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
    router.refresh();
  }

  const canPrev = data.page > 1;
  const canNext = data.page < data.totalPages;
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <StudentSearchInput
            key={params.q}
            initialQuery={params.q}
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
            <Button type="button" onClick={() => setCreateOpen(true)}>
              เพิ่มนักเรียน
            </Button>
          </div>
        ) : null}
      </div>

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
            onClick={() => pushParams({ page: params.page - 1 })}
            disabled={!canPrev}
          >
            ก่อนหน้า
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => pushParams({ page: params.page + 1 })}
            disabled={!canNext}
          >
            ถัดไป
          </Button>
        </div>
      </div>

      <StudentSheet
        open={sheetOpen}
        onOpenChange={handleSheetChange}
        mode={sheetMode}
        readOnly={!isAdmin}
        initial={selectedInitial}
      />

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
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { PaginatedStudents, StudentListRow } from "@/lib/data/students";
import {
  STUDENT_STATUS_FILTER_OPTIONS,
  type StudentStatus,
} from "@/lib/students/constants";
import { StudentSheet } from "@/components/students/student-sheet";

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
  const [searchText, setSearchText] = useState(params.q);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentListRow | null>(null);

  useEffect(() => {
    setSearchText(params.q);
  }, [params.q]);

  function pushParams(next: { q?: string; status?: string; page?: number }) {
    const q = (next.q ?? params.q).trim();
    const status = next.status ?? params.status;
    const page = next.page ?? params.page;
    const query = new URLSearchParams();

    if (q) query.set("q", q);
    if (status && status !== "all") query.set("status", status);
    query.set("page", String(Math.max(1, page)));

    const queryString = query.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchText === params.q) return;
      pushParams({ q: searchText, page: 1 });
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchText, params.q]);

  const canPrev = data.page > 1;
  const canNext = data.page < data.totalPages;
  const sheetOpen = createOpen || Boolean(selectedStudent);
  const sheetMode = createOpen ? "create" : "edit";
  const selectedInitial = useMemo(() => {
    if (!selectedStudent) return undefined;
    return {
      id: selectedStudent.id,
      studentCode: selectedStudent.studentCode,
      firstName: selectedStudent.firstName,
      lastName: selectedStudent.lastName,
      idCard: selectedStudent.idCard,
      status: selectedStudent.statusRaw,
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
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="ค้นหารหัส ชื่อ หรือนามสกุล"
            className="w-full sm:max-w-sm"
          />
          <Select
            value={params.status}
            onValueChange={(value) => pushParams({ status: value ?? "all", page: 1 })}
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
          <Button type="button" onClick={() => setCreateOpen(true)}>
            เพิ่มนักเรียน
          </Button>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัส</TableHead>
            <TableHead>ชื่อ-นามสกุล</TableHead>
            <TableHead>เลขบัตร</TableHead>
            <TableHead>ชั้น</TableHead>
            <TableHead>สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                ไม่พบข้อมูลนักเรียน
              </TableCell>
            </TableRow>
          ) : (
            data.rows.map((student) => (
              <TableRow
                key={student.id}
                className="cursor-pointer"
                onClick={() => setSelectedStudent(student)}
              >
                <TableCell className="font-medium tabular-nums">{student.studentCode}</TableCell>
                <TableCell>{student.name}</TableCell>
                <TableCell>{student.idCard ?? "—"}</TableCell>
                <TableCell>{student.grade}</TableCell>
                <TableCell>
                  <Badge className={statusBadgeClass(student.statusRaw)}>{student.status}</Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {data.total > 0 ? `หน้า ${data.page} จาก ${Math.max(data.totalPages, 1)} (${data.total} คน)` : "0 คน"}
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
    </div>
  );
}

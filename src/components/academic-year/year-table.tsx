"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatThaiDate } from "@/lib/format";
import { deleteAcademicYear } from "@/lib/actions/academic-years";
import type { AcademicYearRow } from "@/lib/data/academic-years";

type YearTableProps = {
  years: AcademicYearRow[];
};

function formatSemesters(year: AcademicYearRow) {
  const nums = year.semesters.map((s) => s.number).sort((a, b) => a - b);
  if (nums.length === 0) return "—";
  return `${nums.length} ภาค (${nums.join(", ")})`;
}

export function YearTable({ years }: YearTableProps) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<AcademicYearRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteAcademicYear(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("ลบปีการศึกษาแล้ว");
    router.refresh();
  }

  if (years.length === 0) {
    return (
      <p className="px-6 pb-6 text-sm text-muted-foreground">
        ยังไม่มีปีการศึกษาในระบบ กดปุ่ม เพิ่มปีการศึกษา เพื่อเริ่มต้น
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อปีการศึกษา</TableHead>
            <TableHead>ช่วงวันที่</TableHead>
            <TableHead>ภาคเรียน</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead className="w-[180px] text-right">การจัดการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {years.map((year) => (
            <TableRow
              key={year.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => router.push(`/academic-year/${year.id}`)}
            >
              <TableCell className="font-medium">{year.name}</TableCell>
              <TableCell>
                {formatThaiDate(year.start_date)} - {formatThaiDate(year.end_date)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatSemesters(year)}
              </TableCell>
              <TableCell>
                {year.is_active ? (
                  <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                    ใช้งานอยู่
                  </Badge>
                ) : (
                  <Badge variant="outline">ไม่ใช้งาน</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/academic-year/${year.id}`);
                    }}
                  >
                    แก้ไข
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={year.is_active}
                    title={year.is_active ? "ไม่สามารถลบปีที่กำลังใช้งาน" : "ลบปีการศึกษา"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(year);
                    }}
                  >
                    ลบ
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบปีการศึกษา</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบปี &quot;{deleteTarget?.name}&quot; หรือไม่? ปีที่มีข้อมูลในระบบหรือกำลังใช้งานจะลบไม่ได้
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

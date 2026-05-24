"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SemesterSummaryList } from "@/components/academic-year/semester-summary-list";
import {
  createYearWithSemesters,
  deleteAcademicYear,
  updateYearMetadata,
} from "@/lib/actions/academic-years";
import { defaultSemesterDates } from "@/lib/academic-year/semester-dates";
import { validateYearForm, type YearFormErrors } from "@/lib/academic-year/form-validation";
import type { AcademicYearRow } from "@/lib/data/academic-years";

type AcademicYearFormPageProps =
  | { mode: "create" }
  | { mode: "edit"; year: AcademicYearRow };

export function AcademicYearFormPage(props: AcademicYearFormPageProps) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const year = isEdit ? props.year : null;

  const [yearState, setYearState] = useState({
    name: year?.name ?? "",
    startDate: year?.start_date ?? "",
    endDate: year?.end_date ?? "",
    isActive: year?.is_active ?? false,
  });
  const [yearErrors, setYearErrors] = useState<YearFormErrors>({});
  const [savingYear, setSavingYear] = useState(false);
  const [addSemesterOpen, setAddSemesterOpen] = useState(false);
  const [deleteYearOpen, setDeleteYearOpen] = useState(false);
  const [deletingYear, setDeletingYear] = useState(false);

  async function handleSaveYear() {
    const validation = validateYearForm(yearState);
    if (!validation.ok) {
      setYearErrors(validation.errors);
      return;
    }

    setYearErrors({});
    setSavingYear(true);

    if (isEdit && year) {
      const result = await updateYearMetadata(year.id, {
        name: yearState.name,
        startDate: yearState.startDate,
        endDate: yearState.endDate,
        isActive: yearState.isActive,
      });
      setSavingYear(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("บันทึกข้อมูลปีการศึกษาแล้ว");
      router.refresh();
      return;
    }

    const defaults = defaultSemesterDates(yearState.startDate, yearState.endDate).semester1;
    const result = await createYearWithSemesters(
      {
        name: yearState.name,
        startDate: yearState.startDate,
        endDate: yearState.endDate,
        isActive: yearState.isActive,
      },
      [
        {
          number: 1,
          name: "",
          startDate: defaults.start,
          endDate: defaults.end,
        },
      ],
    );
    setSavingYear(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("เพิ่มปีการศึกษาแล้ว");
    router.push(`/academic-year/${result.yearId}`);
  }

  async function handleDeleteYear() {
    if (!year) return;
    setDeletingYear(true);
    const result = await deleteAcademicYear(year.id);
    setDeletingYear(false);
    setDeleteYearOpen(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("ลบปีการศึกษาแล้ว");
    router.push("/academic-year");
  }

  const semesterCount = year?.semesters.length ?? 0;

  return (
    <div className="space-y-6">
      <Link
        href="/academic-year"
        className="inline-flex text-sm text-muted-foreground hover:text-foreground"
      >
        ← กลับรายการปีการศึกษา
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isEdit ? `แก้ไขปีการศึกษา ${year?.name}` : "เพิ่มปีการศึกษา"}
        </h1>
        {isEdit && year && !year.is_active && (
          <Button
            type="button"
            variant="outline"
            className="text-destructive"
            onClick={() => setDeleteYearOpen(true)}
          >
            ลบปีการศึกษา
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="border-border shadow-sm lg:sticky lg:top-20 lg:self-start">
          <CardHeader>
            <CardTitle className="text-base">ข้อมูลปีการศึกษา</CardTitle>
            <CardDescription>ชื่อและช่วงวันที่ของปีการศึกษา</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="year-name">ชื่อปีการศึกษา</Label>
              <Input
                id="year-name"
                placeholder="เช่น 2569"
                value={yearState.name}
                onChange={(e) => setYearState((prev) => ({ ...prev, name: e.target.value }))}
                aria-invalid={Boolean(yearErrors.name)}
              />
              <FieldError message={yearErrors.name} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="year-start">วันที่เริ่ม</Label>
              <Input
                id="year-start"
                type="date"
                value={yearState.startDate}
                onChange={(e) => setYearState((prev) => ({ ...prev, startDate: e.target.value }))}
                aria-invalid={Boolean(yearErrors.startDate)}
              />
              <FieldError message={yearErrors.startDate} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="year-end">วันที่สิ้นสุด</Label>
              <Input
                id="year-end"
                type="date"
                value={yearState.endDate}
                onChange={(e) => setYearState((prev) => ({ ...prev, endDate: e.target.value }))}
                aria-invalid={Boolean(yearErrors.endDate)}
              />
              <FieldError message={yearErrors.endDate} />
            </div>
            <Label htmlFor="year-active" className="flex w-fit cursor-pointer items-center gap-3">
              <input
                id="year-active"
                type="checkbox"
                className="size-4 rounded border-border accent-primary"
                checked={yearState.isActive}
                onChange={(e) =>
                  setYearState((prev) => ({ ...prev, isActive: e.target.checked }))
                }
              />
              ตั้งค่าเป็นปีการศึกษาปัจจุบัน
            </Label>
            <Button type="button" className="w-full" onClick={handleSaveYear} disabled={savingYear}>
              {savingYear ? "กำลังบันทึก..." : "บันทึกข้อมูลปี"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="text-base">
                ภาคเรียน{isEdit ? ` (${semesterCount})` : ""}
              </CardTitle>
              <CardDescription>จัดการภาคเรียนในปีนี้</CardDescription>
            </div>
            {isEdit && year && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setAddSemesterOpen(true)}
              >
                <Plus className="mr-1 h-4 w-4" />
                เพิ่มภาคเรียน
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {isEdit && year ? (
              <SemesterSummaryList
                academicYearId={year.id}
                yearStartDate={year.start_date}
                yearEndDate={year.end_date}
                semesters={year.semesters}
                addDialogOpen={addSemesterOpen}
                onAddDialogOpenChange={setAddSemesterOpen}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                บันทึกข้อมูลปีการศึกษาก่อน จากนั้นจะเพิ่มภาคเรียนเพิ่มเติมได้
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteYearOpen} onOpenChange={setDeleteYearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบปีการศึกษา</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบปี &quot;{year?.name}&quot; หรือไม่? ปีที่มีข้อมูลในระบบจะลบไม่ได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingYear}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDeleteYear}
              disabled={deletingYear}
            >
              {deletingYear ? "กำลังลบ..." : "ลบ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

"use client";

import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateFinanceQueries } from "@/lib/queries/invalidate";
import { fetchInvoiceTypes } from "@/lib/queries/invoice-types";
import { useRouter } from "next/navigation";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { generateInvoices } from "@/lib/actions/invoices";
import type { InvoiceCandidateRow } from "@/lib/data/invoices";
import type { FeeItemRow } from "@/lib/data/fee-items";
import { cn } from "@/lib/utils";

type InvoiceGenerateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterId: string;
  academicYearId: string;
  academicYearName: string;
  semesterNumber: number;
  feeItems: FeeItemRow[];
  candidates: InvoiceCandidateRow[];
};

export function InvoiceGenerateDialog({
  open,
  onOpenChange,
  semesterId,
  academicYearId,
  academicYearName,
  semesterNumber,
  feeItems,
  candidates,
}: InvoiceGenerateDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: invoiceTypes = [] } = useQuery({
    queryKey: ["invoice-types"],
    queryFn: fetchInvoiceTypes,
  });
  const [invoiceTypeId, setInvoiceTypeId] = useState<string>("");

  const activeItems = feeItems.filter(
    (i) => i.isActive && (!invoiceTypeId || i.invoiceTypeId === invoiceTypeId),
  );
  // A student is selectable for the chosen type unless they already have an
  // invoice of that exact type. Empty until a type is picked.
  const selectableCandidates = useMemo(
    () =>
      invoiceTypeId
        ? candidates.filter((c) => !c.invoiceTypeIds.includes(invoiceTypeId))
        : [],
    [candidates, invoiceTypeId],
  );

  const [mode, setMode] = useState<"all" | "selected">("all");
  const [selectedFeeItemIds, setSelectedFeeItemIds] = useState<Set<string>>(
    () => new Set(activeItems.map((i) => i.id)),
  );
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [reimbursableStudentIds, setReimbursableStudentIds] = useState<Set<string>>(new Set());
  const [classroomFilter, setClassroomFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Reset ทุก selection เมื่อเปิด dialog ใหม่
  useEffect(() => {
    if (!open) return;
    setMode("all");
    setInvoiceTypeId("");
    setSelectedFeeItemIds(new Set(activeItems.map((i) => i.id)));
    setSelectedStudentIds(new Set());
    setReimbursableStudentIds(new Set());
    setClassroomFilter("all");
    setSearch("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedFeeItemIds(new Set(activeItems.map((i) => i.id))); // eslint-disable-line react-hooks/set-state-in-effect
  }, [invoiceTypeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unique classrooms sorted by grade sort_order defined in the system
  const classrooms = useMemo(() => {
    const sortOrderByRoom = new Map<string, number>();
    for (const c of selectableCandidates) {
      if (!sortOrderByRoom.has(c.gradeClassroom)) {
        sortOrderByRoom.set(c.gradeClassroom, c.gradeSortOrder);
      }
    }
    return [...sortOrderByRoom.keys()].sort((a, b) => {
      const orderDiff = (sortOrderByRoom.get(a) ?? 0) - (sortOrderByRoom.get(b) ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return a.localeCompare(b, "th", { numeric: true });
    });
  }, [selectableCandidates]);

  // Filtered list: classroom chip + search
  const filtered = useMemo(() => {
    let list = selectableCandidates;
    if (classroomFilter !== "all")
      list = list.filter((c) => c.gradeClassroom === classroomFilter);
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (c) =>
          c.studentName.toLowerCase().includes(q) ||
          c.studentCode.toLowerCase().includes(q) ||
          c.gradeClassroom.toLowerCase().includes(q),
      );
    return list;
  }, [selectableCandidates, classroomFilter, search]);

  function toggleFeeItem(id: string) {
    setSelectedFeeItemIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleStudent(id: string) {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleReimbursable(id: string) {
    setReimbursableStudentIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allFeeSelected =
    activeItems.length > 0 && selectedFeeItemIds.size === activeItems.length;

  const allShownSelected =
    mode === "selected" &&
    filtered.length > 0 &&
    filtered.every((c) => selectedStudentIds.has(c.studentId));

  function toggleSelectAllShown() {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (allShownSelected) {
        for (const c of filtered) next.delete(c.studentId);
      } else {
        for (const c of filtered) next.add(c.studentId);
      }
      return next;
    });
  }

  function toggleAllReimbursable() {
    const pool =
      mode === "selected"
        ? selectedStudentIds
        : new Set(selectableCandidates.map((c) => c.studentId));
    const allOn = pool.size > 0 && [...pool].every((id) => reimbursableStudentIds.has(id));
    setReimbursableStudentIds(allOn ? new Set() : new Set(pool));
  }

  const targetCount = mode === "all" ? selectableCandidates.length : selectedStudentIds.size;
  const reimbursableCount =
    mode === "all"
      ? reimbursableStudentIds.size
      : [...selectedStudentIds].filter((id) => reimbursableStudentIds.has(id)).length;

  // For action-row label when a room chip is active
  const roomCount = classroomFilter === "all" ? null : filtered.length;
  const roomSelected =
    classroomFilter !== "all" && filtered.length > 0
      ? filtered.filter((c) => selectedStudentIds.has(c.studentId)).length
      : null;

  function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceTypeId) {
      toast.error("กรุณาเลือกประเภทใบแจ้ง");
      return;
    }
    if (selectedFeeItemIds.size === 0) {
      toast.error("กรุณาเลือกรายการค่าใช้จ่าย");
      return;
    }
    if (mode === "selected" && selectedStudentIds.size === 0) {
      toast.error("กรุณาเลือกนักเรียนอย่างน้อย 1 คน");
      return;
    }
    setConfirmOpen(true);
  }

  async function handleConfirmedSubmit() {
    const feeItemIds = [...selectedFeeItemIds];
    const studentIds = mode === "selected" ? [...selectedStudentIds] : undefined;

    setSubmitting(true);
    const result = await generateInvoices({
      semesterId,
      academicYearId,
      invoiceTypeId,
      feeItemIds,
      studentIds,
      reimbursableStudentIds: [...reimbursableStudentIds],
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`สร้างใบแจ้ง ${result.created} รายการ (ข้าม ${result.skipped})`);
    setConfirmOpen(false);
    onOpenChange(false);
    invalidateFinanceQueries(queryClient);
    router.refresh();
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto p-0 sm:max-w-5xl">
        <form onSubmit={handleRequestSubmit}>
          {/* Header */}
          <div className="px-5 pt-5 pb-3">
            <DialogHeader>
              <DialogTitle>สร้างใบแจ้งชำระ</DialogTitle>
              <DialogDescription>
                ภาคเรียนที่ {semesterNumber} / {academicYearName}
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Two-column layout on desktop */}
          <div className="grid gap-5 px-5 pb-2 sm:grid-cols-[1fr_2.2fr]">

            {/* LEFT — mode + fee items */}
            <div className="space-y-5">
              {/* Invoice type selector */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">ประเภทใบแจ้ง</Label>
                <select
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  value={invoiceTypeId}
                  onChange={(e) => setInvoiceTypeId(e.target.value)}
                >
                  <option value="">— เลือกประเภท —</option>
                  {invoiceTypes
                    .filter((t) => t.isActive)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>

              {invoiceTypeId && (
                <>
                  {/* Mode */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">สร้างให้ใคร</Label>
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                      {[
                        { v: "all",      label: "ทั้งภาค",      hint: `${selectableCandidates.length} คน` },
                        { v: "selected", label: "เลือกรายชื่อ", hint: "เจาะจง" },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setMode(opt.v as "all" | "selected")}
                          className={cn(
                            "flex flex-col items-center gap-0.5 rounded-md px-3 py-2 text-sm transition-all",
                            mode === opt.v
                              ? "bg-background font-medium text-foreground shadow-sm ring-1 ring-foreground/10"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span>{opt.label}</span>
                          <span className="text-xs text-muted-foreground">{opt.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fee items */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-muted-foreground">
                        รายการค่าใช้จ่าย
                        <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-foreground">
                          {selectedFeeItemIds.size}/{activeItems.length}
                        </span>
                      </Label>
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() =>
                          setSelectedFeeItemIds(
                            allFeeSelected ? new Set() : new Set(activeItems.map((i) => i.id)),
                          )
                        }
                      >
                        {allFeeSelected ? "ล้างทั้งหมด" : "เลือกทั้งหมด"}
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {activeItems.map((item) => {
                        const checked = selectedFeeItemIds.has(item.id);
                        return (
                          <Label
                            key={item.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-normal transition-colors",
                              checked
                                ? "border-primary/30 bg-primary/5"
                                : "border-border hover:bg-muted/50",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="size-4 shrink-0 rounded border-border accent-primary"
                              checked={checked}
                              onChange={() => toggleFeeItem(item.id)}
                            />
                            <span className="flex-1 truncate">{item.name}</span>
                            {item.isTuition ? (
                              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                เล่าเรียน
                              </span>
                            ) : null}
                          </Label>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* RIGHT — students with classroom chips */}
            <div className="space-y-2">
              {!invoiceTypeId ? (
                <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  เลือกประเภทใบแจ้งก่อน เพื่อแสดงรายชื่อนักเรียน
                </div>
              ) : (
                <>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  {mode === "selected" ? "เลือกนักเรียน" : "นักเรียนที่จะได้รับใบ"}
                  {mode === "selected" ? (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-foreground">
                      {selectedStudentIds.size}
                    </span>
                  ) : null}
                </Label>
                <button
                  type="button"
                  className="text-xs font-medium text-sky-700 hover:underline"
                  onClick={toggleAllReimbursable}
                >
                  สลับเบิกได้ทุกคน
                </button>
              </div>

              {/* Classroom filter chips */}
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setClassroomFilter("all")}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    classroomFilter === "all"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  ทั้งหมด
                </button>
                {classrooms.map((room) => {
                  const inRoom = selectableCandidates.filter((c) => c.gradeClassroom === room).length;
                  const selectedInRoom = selectableCandidates.filter(
                    (c) => c.gradeClassroom === room && selectedStudentIds.has(c.studentId),
                  ).length;
                  const active = classroomFilter === room;
                  return (
                    <button
                      key={room}
                      type="button"
                      onClick={() => setClassroomFilter(room)}
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                      )}
                    >
                      {room}
                      {mode === "selected" && selectedInRoom > 0 ? (
                        <span
                          className={cn(
                            "rounded-full px-1 tabular-nums text-[10px]",
                            active ? "bg-white/20" : "bg-primary/10 text-primary",
                          )}
                        >
                          {selectedInRoom}/{inRoom}
                        </span>
                      ) : (
                        <span className={cn("tabular-nums text-[10px]", active ? "opacity-70" : "opacity-50")}>
                          {inRoom}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ / รหัส / ห้อง…"
                className="h-8 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
              />

              {/* Action row */}
              {mode === "selected" && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={toggleSelectAllShown}
                  >
                    {allShownSelected
                      ? classroomFilter === "all"
                        ? "ยกเลิกทั้งหมด"
                        : `ยกเลิกห้อง ${classroomFilter}`
                      : classroomFilter === "all"
                        ? "เลือกทั้งหมด"
                        : `เลือกทั้งห้อง ${classroomFilter}`}
                  </button>
                  {classroomFilter !== "all" && roomCount !== null && (
                    <span className="text-muted-foreground">
                      ({roomSelected}/{roomCount} คน)
                    </span>
                  )}
                </div>
              )}

              {/* Student list */}
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                  {mode === "selected" ? (
                    <input
                      type="checkbox"
                      className="size-4 rounded border-border accent-primary"
                      checked={allShownSelected}
                      onChange={toggleSelectAllShown}
                      aria-label="เลือกทั้งหมดที่แสดง"
                    />
                  ) : null}
                  <span className="flex-1">นักเรียน</span>
                  <span>เบิกได้</span>
                </div>

                <div className="max-h-64 divide-y divide-border/60 overflow-y-auto">
                  {selectableCandidates.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      ไม่มีนักเรียนที่สร้างใบได้
                    </p>
                  ) : filtered.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      ไม่พบนักเรียน
                    </p>
                  ) : (
                    filtered.map((c) => {
                      const selected = mode === "all" || selectedStudentIds.has(c.studentId);
                      const reimb = reimbursableStudentIds.has(c.studentId);
                      return (
                        <div
                          key={c.studentId}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 transition-colors",
                            reimb && "bg-green-50",
                            mode === "selected" && !selected && "opacity-55",
                          )}
                        >
                          {mode === "selected" ? (
                            <input
                              type="checkbox"
                              className="size-4 rounded border-border accent-primary"
                              checked={selectedStudentIds.has(c.studentId)}
                              onChange={() => toggleStudent(c.studentId)}
                            />
                          ) : null}
                          <div className="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
                            <span className="tabular-nums text-muted-foreground">{c.studentCode}</span>
                            <span className="truncate">{c.studentName}</span>
                            {classroomFilter === "all" && (
                              <span className="text-xs text-muted-foreground">{c.gradeClassroom}</span>
                            )}
                          </div>
                          {/* Toggle switch */}
                          <button
                            type="button"
                            onClick={() => toggleReimbursable(c.studentId)}
                            disabled={mode === "selected" && !selected}
                            className={cn(
                              "relative h-6 w-[54px] shrink-0 rounded-full transition-colors disabled:opacity-40",
                              reimb ? "bg-primary" : "bg-muted",
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-[3px] size-[18px] rounded-full bg-white shadow-sm transition-all",
                                reimb ? "left-[33px]" : "left-[3px]",
                              )}
                            />
                            {reimb && (
                              <span className="absolute left-[7px] top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white">
                                เบิก
                              </span>
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
                </>
              )}
            </div>
          </div>

          {/* Summary + footer */}
          <div className="mt-4 rounded-b-xl border-t bg-muted/50 px-5 py-4">
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span>
                จะสร้าง{" "}
                <span className="font-semibold tabular-nums text-foreground">{targetCount}</span>{" "}
                ใบ
              </span>
              <span className="text-muted-foreground">{selectedFeeItemIds.size} รายการ/ใบ</span>
              {reimbursableCount > 0 ? (
                <span className="text-sky-700">
                  เบิกได้{" "}
                  <span className="font-semibold tabular-nums">{reimbursableCount}</span> คน
                </span>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => onOpenChange(false)}
              >
                ยกเลิก
              </Button>
              <Button
                type="submit"
                disabled={submitting || targetCount === 0 || selectedFeeItemIds.size === 0 || !invoiceTypeId}
              >
                {submitting
                  ? "กำลังสร้าง..."
                  : targetCount > 0
                    ? `สร้างใบแจ้ง (${targetCount})`
                    : "สร้างใบแจ้ง"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ยืนยันสร้างใบแจ้งชำระ</AlertDialogTitle>
          <AlertDialogDescription>
            จะสร้างใบแจ้งชำระ{" "}
            <span className="font-semibold text-foreground tabular-nums">{targetCount}</span> ใบ
            สำหรับ{mode === "all" ? "นักเรียนทั้งภาคที่ยังไม่มีใบ" : "นักเรียนที่เลือกไว้"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 text-sm">
          <ul className="list-disc pl-5 text-muted-foreground">
            <li>
              รายการค่าใช้จ่าย{" "}
              <span className="font-medium text-foreground">{selectedFeeItemIds.size}</span> รายการ/ใบ
            </li>
            {reimbursableCount > 0 && (
              <li>
                เบิกได้{" "}
                <span className="font-medium text-sky-700 tabular-nums">{reimbursableCount}</span> คน
              </li>
            )}
          </ul>
          <p className="text-muted-foreground">การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>ยกเลิก</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmedSubmit} disabled={submitting}>
            {submitting ? "กำลังสร้าง..." : `ยืนยัน สร้าง ${targetCount} ใบ`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

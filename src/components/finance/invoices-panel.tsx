"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { AppHeader } from "@/components/app-header";
import { InvoicePaymentDialog } from "@/components/finance/invoice-payment-dialog";
import { InvoiceReimbursableDialog } from "@/components/finance/invoice-reimbursable-dialog";
import { InvoiceGenerateDialog } from "@/components/finance/invoice-generate-dialog";
import { StudentSearchInput } from "@/components/students/student-search-input";
import { useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { deleteInvoices } from "@/lib/actions/invoices";
import { formatBaht } from "@/lib/format";
import { INVOICE_STATUS_LABELS } from "@/lib/finance/constants";
import {
  canDeleteInvoice,
  invoiceDeleteBlockedReason,
} from "@/lib/finance/invoice-delete-eligibility";
import { invalidateFinanceQueries } from "@/lib/queries/invalidate";
import { fetchAllInvoices, fetchInvoiceCandidates } from "@/lib/queries/invoices";
import { fetchGradeLevels, fetchClassroomsBySemester } from "@/lib/queries/classrooms";
import { fetchAllFeeItems } from "@/lib/queries/fee-rates";
import type { InvoiceListRow, InvoiceStatus } from "@/lib/queries/invoices";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

const STATUS_FILTER_ITEMS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "unpaid", label: "ค้างชำระ" },
  { value: "partial", label: "ชำระบางส่วน" },
  { value: "paid", label: "ชำระแล้ว" },
];

const REIMBURSABLE_FILTER_ITEMS = [
  { value: "all", label: "ทุกประเภท" },
  { value: "reimbursable", label: "เบิกได้" },
  { value: "standard", label: "เบิกไม่ได้" },
];

function statusBadgeClass(status: InvoiceListRow["status"]) {
  if (status === "paid") return "bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  if (status === "partial") return "bg-amber-50 text-amber-700 hover:bg-amber-50";
  return "bg-red-50 text-red-700 hover:bg-red-50";
}

export function InvoicesPanel() {
  useRequireRole("admin");

  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ctx, isLoading: ctxLoading } = useSemesterContext();

  const qParam = searchParams.get("q") ?? "";
  const statusParam = searchParams.get("status") ?? "all";
  const gradeParam = searchParams.get("grade") ?? "all";
  const classroomParam = searchParams.get("classroom") ?? "all";
  const reimbursableParam = searchParams.get("reimbursable") ?? "all";
  const pageParam = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const status: InvoiceStatus | "all" =
    statusParam === "unpaid" || statusParam === "partial" || statusParam === "paid"
      ? statusParam
      : "all";

  const [generateOpen, setGenerateOpen] = useState(false);
  const [reimbursableTarget, setReimbursableTarget] = useState<InvoiceListRow | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<InvoiceListRow | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isNavigating, startTransition] = useTransition();

  const reimbursable: "reimbursable" | "standard" | "all" =
    reimbursableParam === "reimbursable" || reimbursableParam === "standard"
      ? reimbursableParam
      : "all";

  const { data: allInvoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["invoices", ctx?.semesterId, ctx?.academicYearId],
    queryFn: () => fetchAllInvoices({ semesterId: ctx!.semesterId, academicYearId: ctx!.academicYearId }),
    enabled: Boolean(ctx?.semesterId),
    staleTime: 30_000,
  });

  const { data: feeItems = [] } = useQuery({
    queryKey: ["fee-items", "all"],
    queryFn: fetchAllFeeItems,
    staleTime: 60_000,
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ["invoice-candidates", ctx?.semesterId],
    queryFn: () => fetchInvoiceCandidates(ctx!.semesterId),
    enabled: Boolean(ctx?.semesterId),
    staleTime: 30_000,
  });

  const { data: grades = [] } = useQuery({
    queryKey: ["grade-levels", ctx?.semesterId],
    queryFn: () => fetchGradeLevels(ctx!.semesterId),
    enabled: Boolean(ctx?.semesterId),
    staleTime: 60_000,
  });

  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms", ctx?.semesterId],
    queryFn: () => fetchClassroomsBySemester(ctx!.semesterId),
    enabled: Boolean(ctx?.semesterId),
    staleTime: 60_000,
  });

  const isLoading = ctxLoading || invoicesLoading;

  const PAGE_SIZE = 50;

  const filteredRows = useMemo(() => {
    let rows = allInvoices;
    if (gradeParam !== "all") rows = rows.filter((r) => r.gradeLevelId === gradeParam);
    if (classroomParam !== "all") rows = rows.filter((r) => r.classroomId === classroomParam);
    if (status !== "all") rows = rows.filter((r) => r.status === status);
    if (reimbursable !== "all")
      rows = rows.filter((r) => r.isReimbursable === (reimbursable === "reimbursable"));
    const q = qParam.trim().toLowerCase();
    if (q)
      rows = rows.filter(
        (r) =>
          r.studentName.toLowerCase().includes(q) ||
          r.studentCode.toLowerCase().includes(q) ||
          r.gradeClassroom.toLowerCase().includes(q),
      );
    return rows;
  }, [allInvoices, gradeParam, classroomParam, status, reimbursable, qParam]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(pageParam, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const data = {
    rows: pagedRows,
    total: filteredRows.length,
    page: safePage,
    pageSize: PAGE_SIZE,
    totalPages,
  };

  function deleteContextFor(row: InvoiceListRow) {
    return {
      paidAmount: row.paidAmount,
      totalAmount: row.totalAmount,
      hasActivePaymentAllocation: row.hasActivePaymentAllocation,
    };
  }

  const deletableRows = useMemo(
    () => filteredRows.filter((row) => canDeleteInvoice(deleteContextFor(row))),
    [filteredRows],
  );

  const allDeletableSelected =
    deletableRows.length > 0 && deletableRows.every((row) => selectedIds.has(row.id));

  useEffect(() => {
    startTransition(() => setSelectedIds(new Set()));
  }, [data.page, qParam, status, gradeParam, classroomParam, reimbursableParam]);

  // Build a grade name lookup map
  const gradeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of grades) {
      map.set(g.id, g.name);
    }
    return map;
  }, [grades]);

  const gradeItems = [
    { value: "all", label: "ทุกชั้น" },
    ...grades.map((g) => ({ value: g.id, label: g.name })),
  ];

  const classroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => gradeParam === "all" || c.grade_level_id === gradeParam)
      .map((c) => {
        const gradeName = gradeNameById.get(c.grade_level_id) ?? "";
        return { value: c.id, label: gradeName ? `${gradeName}/${c.name}` : c.name };
      }),
  ];

  const pushParams = useCallback(
    (next: Partial<{
      q: string;
      status: string;
      grade: string;
      classroom: string;
      reimbursable: string;
      page: number;
    }>) => {
      const query = new URLSearchParams();
      const q = (next.q ?? qParam).trim();
      const newStatus = next.status ?? statusParam;
      const grade = next.grade ?? gradeParam;
      const classroom = next.classroom ?? classroomParam;
      const reimbursable = next.reimbursable ?? reimbursableParam;
      const page = next.page ?? pageParam;

      if (q) query.set("q", q);
      if (newStatus && newStatus !== "all") query.set("status", newStatus);
      if (grade && grade !== "all") query.set("grade", grade);
      if (classroom && classroom !== "all") query.set("classroom", classroom);
      if (reimbursable && reimbursable !== "all") query.set("reimbursable", reimbursable);
      query.set("page", String(Math.max(1, page)));

      const yearSemester = new URLSearchParams(window.location.search);
      if (yearSemester.get("year")) query.set("year", yearSemester.get("year")!);
      if (yearSemester.get("semester")) query.set("semester", yearSemester.get("semester")!);

      startTransition(() => {
        router.push(`${pathname}?${query.toString()}`);
      });
    },
    [qParam, statusParam, gradeParam, classroomParam, reimbursableParam, pageParam, pathname, router, startTransition],
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
    const result = await deleteInvoices(deleteTargetIds);
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

    if (result.skipped > 0) {
      toast.success(`ลบแล้ว ${result.deleted} ใบ (ข้าม ${result.skipped} ใบที่ลบไม่ได้)`);
    } else {
      toast.success(`ลบใบแจ้งชำระแล้ว ${result.deleted} ใบ`);
    }
    invalidateFinanceQueries(queryClient);
    router.refresh();
  }

  const bulkDeleteCount = selectedIds.size;

  function paymentsHref(studentCode: string) {
    const params = new URLSearchParams({ q: studentCode });
    const year = searchParams.get("year");
    const semester = searchParams.get("semester");
    if (year) params.set("year", year);
    if (semester) params.set("semester", semester);
    return `/payments?${params.toString()}`;
  }

  return (
    <>
      <AppHeader title="ใบแจ้งชำระ" basePath="/invoices" />
      <main className="p-4 lg:p-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>รายการใบแจ้งชำระ</CardTitle>
            <CardDescription>
              {ctx ? `${data.total} ใบ` : "ยังไม่มีปีการศึกษา/ภาคเรียน"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!ctx && !ctxLoading ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษา/ภาคเรียนในระบบ</p>
            ) : isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full max-w-2xl" />
                <TableSkeleton rows={8} />
              </div>
            ) : ctx ? (
              <div className={cn("space-y-4 transition-opacity", isNavigating && "pointer-events-none opacity-60")}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-1 flex-wrap gap-2">
                    <StudentSearchInput
                      initialQuery={qParam}
                      onDebouncedChange={(q) => pushParams({ q, page: 1 })}
                    />
                    <Select
                      value={statusParam}
                      onValueChange={(v) => pushParams({ status: v ?? "all", page: 1 })}
                      items={STATUS_FILTER_ITEMS}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="สถานะ" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_FILTER_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={reimbursableParam}
                      onValueChange={(v) => pushParams({ reimbursable: v ?? "all", page: 1 })}
                      items={REIMBURSABLE_FILTER_ITEMS}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="ประเภท" />
                      </SelectTrigger>
                      <SelectContent>
                        {REIMBURSABLE_FILTER_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={gradeParam}
                      onValueChange={(v) => pushParams({ grade: v ?? "all", classroom: "all", page: 1 })}
                      items={gradeItems}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="ชั้น" />
                      </SelectTrigger>
                      <SelectContent>
                        {gradeItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={classroomParam}
                      onValueChange={(v) => pushParams({ classroom: v ?? "all", page: 1 })}
                      items={classroomItems}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="ห้อง" />
                      </SelectTrigger>
                      <SelectContent>
                        {classroomItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                    <Button type="button" onClick={() => setGenerateOpen(true)}>
                      สร้างใบแจ้งชำระ
                    </Button>
                  </div>
                </div>

                {/* Mobile stacked cards */}
                {filteredRows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground sm:hidden">
                    ไม่พบใบแจ้งชำระ
                  </p>
                ) : (
                  <div className="sm:hidden divide-y divide-border rounded-lg border border-border">
                    {data.rows.map((row) => {
                      const deleteCtx = deleteContextFor(row);
                      const deletable = canDeleteInvoice(deleteCtx);
                      const blockedReason = invoiceDeleteBlockedReason(deleteCtx);
                      return (
                        <div key={row.id} className="space-y-2 px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate font-medium">{row.studentName}</p>
                                {row.isReimbursable ? (
                                  <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">เบิกได้</Badge>
                                ) : null}
                              </div>
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {row.studentCode} · {row.gradeClassroom}
                              </p>
                              <p className="mt-0.5 max-w-[200px] truncate text-sm text-muted-foreground">
                                {row.invoiceName}
                              </p>
                            </div>
                            <Badge className={statusBadgeClass(row.status)}>
                              {INVOICE_STATUS_LABELS[row.status]}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              ต้องชำระ{" "}
                              <span className="tabular-nums text-foreground">
                                {formatBaht(row.totalAmount)}
                              </span>
                            </span>
                            {row.outstanding > 0 ? (
                              <span className="text-amber-700 tabular-nums">
                                ค้าง {formatBaht(row.outstanding)}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex justify-end gap-2">
                            {row.status !== "paid" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => { setPaymentTarget(row); setPaymentOpen(true); }}
                              >
                                ชำระเงิน
                              </Button>
                            ) : null}
                            {row.paidAmount > 0 ? (
                              <a href={paymentsHref(row.studentCode)}>
                                <Button type="button" size="sm" variant="outline">
                                  ดูการชำระ
                                </Button>
                              </a>
                            ) : null}
                            {row.paidAmount === 0 ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setReimbursableTarget(row)}
                              >
                                {row.isReimbursable ? "เปลี่ยนเป็นเบิกไม่ได้" : "เปลี่ยนเป็นเบิกได้"}
                              </Button>
                            ) : null}
                            {deletable ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-destructive"
                                onClick={() => setDeleteTargetIds([row.id])}
                              >
                                ลบ
                              </Button>
                            ) : blockedReason ? (
                              <span className="text-xs text-muted-foreground" title={blockedReason}>
                                ลบไม่ได้
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Desktop table */}
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
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
                        <TableHead>รหัส</TableHead>
                        <TableHead>ชื่อ-นามสกุล</TableHead>
                        <TableHead>ชั้น/ห้อง</TableHead>
                        <TableHead>ประเภทใบแจ้ง</TableHead>
                        <TableHead className="text-right">ต้องชำระ</TableHead>
                        <TableHead className="text-right">ค้าง</TableHead>
                        <TableHead>สถานะ</TableHead>
                        <TableHead className="w-[140px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                            ไม่พบใบแจ้งชำระ
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.rows.map((row) => {
                          const deleteCtx = deleteContextFor(row);
                          const deletable = canDeleteInvoice(deleteCtx);
                          const blockedReason = invoiceDeleteBlockedReason(deleteCtx);
                          return (
                            <TableRow key={row.id}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  className="size-4 rounded border-border"
                                  checked={selectedIds.has(row.id)}
                                  disabled={!deletable}
                                  title={blockedReason ?? undefined}
                                  aria-label={`เลือก ${row.studentCode}`}
                                  onChange={(e) => toggleRow(row.id, e.target.checked)}
                                />
                              </TableCell>
                              <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span>{row.studentName}</span>
                                  {row.isReimbursable ? (
                                    <Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">เบิกได้</Badge>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell>{row.gradeClassroom}</TableCell>
                              <TableCell className="max-w-[180px] truncate">{row.invoiceName}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatBaht(row.totalAmount)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatBaht(row.outstanding)}
                              </TableCell>
                              <TableCell>
                                <Badge className={statusBadgeClass(row.status)}>
                                  {INVOICE_STATUS_LABELS[row.status]}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end gap-1">
                                  {row.status !== "paid" ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => { setPaymentTarget(row); setPaymentOpen(true); }}
                                    >
                                      ชำระเงิน
                                    </Button>
                                  ) : null}
                                  {row.paidAmount > 0 ? (
                                    <a
                                      href={paymentsHref(row.studentCode)}
                                      className={buttonVariants({ size: "sm", variant: "outline" })}
                                    >
                                      ดูการชำระ
                                    </a>
                                  ) : null}
                                  {row.paidAmount === 0 ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className={row.isReimbursable ? "text-sky-600 border-sky-200" : ""}
                                      onClick={() => setReimbursableTarget(row)}
                                    >
                                      {row.isReimbursable ? "เบิกได้ ✓" : "เบิกได้"}
                                    </Button>
                                  ) : null}
                                  {deletable ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="text-destructive"
                                      onClick={() => setDeleteTargetIds([row.id])}
                                    >
                                      ลบ
                                    </Button>
                                  ) : blockedReason ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled
                                      title={blockedReason}
                                    >
                                      ลบไม่ได้
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>
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
                      ? `หน้า ${data.page} จาก ${Math.max(data.totalPages, 1)} (${data.total} ใบ)`
                      : "0 ใบ"}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={data.page <= 1}
                      onClick={() => pushParams({ page: data.page - 1 })}
                    >
                      ก่อนหน้า
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={data.page >= data.totalPages}
                      onClick={() => pushParams({ page: data.page + 1 })}
                    >
                      ถัดไป
                    </Button>
                  </div>
                </div>

                <InvoiceGenerateDialog
                  open={generateOpen}
                  onOpenChange={setGenerateOpen}
                  semesterId={ctx.semesterId}
                  academicYearId={ctx.academicYearId}
                  academicYearName={ctx.academicYearName}
                  semesterNumber={ctx.semesterNumber}
                  feeItems={feeItems}
                  candidates={candidates}
                />

                <InvoicePaymentDialog
                  invoice={paymentTarget}
                  open={paymentOpen}
                  onOpenChange={(open) => {
                    setPaymentOpen(open);
                    if (!open) setPaymentTarget(null);
                  }}
                />

                <InvoiceReimbursableDialog
                  open={Boolean(reimbursableTarget)}
                  onOpenChange={(open) => !open && setReimbursableTarget(null)}
                  invoice={reimbursableTarget}
                />

                <AlertDialog
                  open={Boolean(deleteTargetIds)}
                  onOpenChange={(open) => !open && !deleting && setDeleteTargetIds(null)}
                >
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>ลบใบแจ้งชำระ</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <span>
                          {deleteTargetIds && deleteTargetIds.length > 1
                            ? `ยืนยันลบ ${deleteTargetIds.length} ใบ — เฉพาะใบที่ยกเลิกใบเสร็จครบแล้วจะถูกลบ`
                            : "ยืนยันลบใบแจ้งชำระนี้ — การลบไม่สามารถย้อนกลับได้"}
                        </span>
                        <span className="block text-muted-foreground">
                          ประวัติใบเสร็จที่ยกเลิกแล้วจะยังอยู่ในระบบ
                        </span>
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
              </div>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

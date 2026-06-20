"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { AppHeader } from "@/components/app-header";
import { PaymentImportDialog } from "@/components/finance/payment-import-dialog";
import { useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { formatBaht } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/constants";
import {
  getStudentOutstandingAction,
  recordPayment,
  searchStudentsForPaymentAction,
  voidPayment,
} from "@/lib/actions/payments";
import { fetchPaymentsFiltered } from "@/lib/queries/payments";
import { fetchGradeLevels, fetchClassroomsBySemester } from "@/lib/queries/classrooms";
import type { OutstandingInvoiceRow } from "@/lib/data/invoices";
import type { PaymentListRow } from "@/lib/queries/payments";
import { cn } from "@/lib/utils";

const methodItems = [
  { value: "cash", label: PAYMENT_METHOD_LABELS.cash },
  { value: "transfer", label: PAYMENT_METHOD_LABELS.transfer },
];

// Resolve a single line's discount amount, capped at the line amount.
function resolveOne(lineAmount: number, raw?: { value: string; unit: "fixed" | "percent" }) {
  if (!raw) return 0;
  const v = Number.parseFloat(raw.value);
  if (!Number.isFinite(v) || v <= 0) return 0;
  const amt = raw.unit === "percent" ? (lineAmount * v) / 100 : v;
  return Math.min(Math.round(amt * 100) / 100, lineAmount);
}


export function PaymentsPanel() {
  useRequireRole(["admin", "finance"]);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { ctx, isLoading: ctxLoading } = useSemesterContext();

  const gradeParam = searchParams.get("grade") ?? "all";
  const classroomParam = searchParams.get("classroom") ?? "all";
  const qParam = searchParams.get("q") ?? "";

  const [searchQuery, setSearchQuery] = useState("");
  const [searchGrade, setSearchGrade] = useState("all");
  const [searchClassroom, setSearchClassroom] = useState("all");
  const [searchResults, setSearchResults] = useState<
    { id: string; studentCode: string; name: string; gradeClassroom: string }[]
  >([]);
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string;
    studentCode: string;
    name: string;
    gradeClassroom: string;
  } | null>(null);
  const [outstanding, setOutstanding] = useState<OutstandingInvoiceRow[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<OutstandingInvoiceRow | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [transferRef, setTransferRef] = useState("");
  const [note, setNote] = useState("");
  // invoiceLineId -> { value: string; unit: "fixed" | "percent" } — applies to the selected invoice's lines
  const [lineDiscounts, setLineDiscounts] = useState<
    Record<string, { value: string; unit: "fixed" | "percent" }>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [lastPayment, setLastPayment] = useState<{ id: string; receiptNumber: string; amount: number } | null>(null);
  const [voidTarget, setVoidTarget] = useState<PaymentListRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [paymentSearch, setPaymentSearch] = useState(qParam);
  const [voiding, setVoiding] = useState(false);
  const [isNavigating, startTransition] = useTransition();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const receiptIframeRef = useRef<HTMLIFrameElement>(null);

  function printReceipt(paymentId: string) {
    const iframe = receiptIframeRef.current;
    if (iframe) {
      // Loads the receipt inside a hidden iframe; the receipt page
      // auto-prints itself (?autoprint=1). Avoids the popup blocker.
      iframe.src = `/receipts/${paymentId}?autoprint=1`;
    } else {
      window.open(`/receipts/${paymentId}`, "_blank", "noopener,noreferrer");
    }
  }

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

  const { data: filteredPayments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: [
      "payments",
      ctx?.academicYearId,
      ctx?.semesterId,
      gradeParam,
      classroomParam,
    ],
    queryFn: () =>
      fetchPaymentsFiltered({
        academicYearId: ctx!.academicYearId,
        semesterId: ctx!.semesterId,
        gradeLevelId: gradeParam !== "all" ? gradeParam : undefined,
        classroomId: classroomParam !== "all" ? classroomParam : undefined,
      }),
    enabled: Boolean(ctx?.semesterId),
    staleTime: 30_000,
  });

  // Build a grade name lookup map from the fetched grades
  const gradeNameById = new Map(grades.map((g) => [g.id, g.name]));

  const gradeItems = [
    { value: "all", label: "ทุกชั้น" },
    ...grades.map((g) => ({ value: g.id, label: g.name })),
  ];

  const classroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => gradeParam === "all" || c.grade_level_id === gradeParam)
      .map((c) => ({
        value: c.id,
        label: `${gradeNameById.get(c.grade_level_id) ?? ""}/${c.name}`,
      })),
  ];

  const searchClassroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => searchGrade === "all" || c.grade_level_id === searchGrade)
      .map((c) => ({
        value: c.id,
        label: `${gradeNameById.get(c.grade_level_id) ?? ""}/${c.name}`,
      })),
  ];

  const pushParams = useCallback(
    (next: { grade?: string; classroom?: string }) => {
      const query = new URLSearchParams();
      const grade = next.grade ?? gradeParam;
      const classroom = next.classroom ?? classroomParam;

      if (grade && grade !== "all") query.set("grade", grade);
      if (classroom && classroom !== "all") query.set("classroom", classroom);

      const yearSemester = new URLSearchParams(window.location.search);
      if (yearSemester.get("year")) query.set("year", yearSemester.get("year")!);
      if (yearSemester.get("semester")) query.set("semester", yearSemester.get("semester")!);

      startTransition(() => {
        router.push(`${pathname}?${query.toString()}`);
      });
    },
    [gradeParam, classroomParam, pathname, router, startTransition],
  );

  useEffect(() => {
    if (!ctx?.semesterId) return;

    const q = searchQuery.trim();
    const hasScope = searchGrade !== "all" || searchClassroom !== "all";

    if (q.length < 2 && !hasScope) {
      startTransition(() => setSearchResults([]));
      return;
    }

    const timer = setTimeout(async () => {
      const result = await searchStudentsForPaymentAction(ctx.semesterId, {
        query: q.length >= 2 ? q : undefined,
        gradeLevelId: searchGrade !== "all" ? searchGrade : undefined,
        classroomId: searchClassroom !== "all" ? searchClassroom : undefined,
      });
      if (result.ok) setSearchResults(result.students);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchGrade, searchClassroom, ctx?.semesterId]);

  async function selectStudent(student: (typeof searchResults)[number]) {
    if (!ctx?.semesterId) return;
    setLastPayment(null);
    setSelectedStudent(student);
    setSelectedInvoice(null);
    setLineDiscounts({});
    setSearchQuery("");
    setSearchResults([]);

    const result = await getStudentOutstandingAction(student.id, ctx.semesterId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setOutstanding(result.invoices);
    setAmount("");
  }

  function requestRecord() {
    if (!selectedStudent || !ctx) return;
    if (!selectedInvoice) {
      toast.error("เลือกใบแจ้งที่จะชำระ");
      return;
    }
    const parsed = Number.parseFloat(effectiveAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("กรุณาระบุจำนวนเงิน");
      return;
    }
    if (parsed > selectedInvoice.outstanding) {
      toast.error(`จำนวนเงินเกินยอดค้าง (${formatBaht(selectedInvoice.outstanding)})`);
      return;
    }
    if (hasDiscount && netDue <= 0) {
      toast.error("ยอดสุทธิหลังหักส่วนลดต้องมากกว่า 0");
      return;
    }

    setConfirmOpen(true);
  }

  async function handleRecord() {
    if (!selectedInvoice || !selectedStudent || !ctx) return;
    const parsedAmount = Number.parseFloat(effectiveAmount);

    const discounts = selectedInvoice.lines
      .map((l) => {
        const d = lineDiscounts[l.id];
        if (!d) return null;
        const v = Number.parseFloat(d.value);
        if (!Number.isFinite(v) || v <= 0) return null;
        return { invoiceLineId: l.id, discountType: d.unit, discountValue: v };
      })
      .filter(
        (x): x is { invoiceLineId: string; discountType: "fixed" | "percent"; discountValue: number } =>
          x != null,
      );

    setSubmitting(true);
    const result = await recordPayment({
      invoiceId: selectedInvoice.id,
      studentId: selectedStudent.id,
      academicYearId: ctx.academicYearId,
      academicYearName: ctx.academicYearName,
      semesterId: ctx.semesterId,
      amount: parsedAmount,
      paymentMethod: method,
      transferReference: method === "transfer" ? transferRef : undefined,
      note,
      discounts: discounts.length > 0 ? discounts : undefined,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setConfirmOpen(false);
    toast.success("บันทึกการชำระและออกใบเสร็จแล้ว");
    setLastPayment({ id: result.paymentId, receiptNumber: result.receiptNumber, amount: parsedAmount });
    printReceipt(result.paymentId);
    setSelectedStudent(null);
    setOutstanding([]);
    setSelectedInvoice(null);
    setAmount("");
    setNote("");
    setTransferRef("");
    setLineDiscounts({});
    void queryClient.invalidateQueries({ queryKey: ["payments"] });
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["invoice-candidates"] });
    router.refresh();

    // Ready for the next parent: focus search again
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }

  async function handleVoid() {
    if (!voidTarget) return;
    setVoiding(true);
    const result = await voidPayment(voidTarget.id, voidReason);
    setVoiding(false);
    setVoidTarget(null);
    setVoidReason("");

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("ยกเลิกใบเสร็จแล้ว");
    void queryClient.invalidateQueries({ queryKey: ["payments"] });
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["invoice-candidates"] });
    router.refresh();
  }

  const isLoading = ctxLoading || paymentsLoading;

  const displayedPayments = paymentSearch.trim()
    ? filteredPayments.filter((p) => {
        const q = paymentSearch.trim().toLowerCase();
        return (
          p.studentCode.toLowerCase().includes(q) ||
          p.studentName.toLowerCase().includes(q)
        );
      })
    : filteredPayments;

  if (ctxLoading) {
    return (
      <>
        <AppHeader title="การชำระเงิน" basePath="/payments" />
        <main className="p-4 lg:p-6">
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        </main>
      </>
    );
  }

  if (!ctx) {
    return (
      <>
        <AppHeader title="การชำระเงิน" basePath="/payments" />
        <main className="p-4 lg:p-6">
          <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษา/ภาคเรียนในระบบ</p>
        </main>
      </>
    );
  }

  const selectedOutstanding = selectedInvoice?.outstanding ?? 0;
  const selectedLines = selectedInvoice?.lines ?? [];
  const totalDiscount =
    Math.round(
      selectedLines.reduce((sum, l) => sum + resolveOne(l.amount, lineDiscounts[l.id]), 0) * 100,
    ) / 100;
  const hasDiscount = totalDiscount > 0;
  const netDue = Math.round((selectedOutstanding - totalDiscount) * 100) / 100;
  // When discounting, the amount is derived from the discount inputs (netDue),
  // so the submission path reads a consistent value regardless of the input state.
  const effectiveAmount = hasDiscount ? (netDue > 0 ? String(netDue) : "") : amount;
  const parsedAmount = Number.parseFloat(effectiveAmount);
  const amountExceeds = Number.isFinite(parsedAmount) && parsedAmount > selectedOutstanding;

  return (
    <>
      <AppHeader title="การชำระเงิน" basePath="/payments" />
      <main className="p-4 lg:p-6">
        <div
          className={cn(
            "space-y-6 transition-opacity",
            (isNavigating || isLoading) && "pointer-events-none opacity-60",
          )}
        >
          <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">ค้นหานักเรียน</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Primary search — type code or name, Enter to pick */}
              <Input
                ref={searchInputRef}
                autoFocus
                className="h-11 text-base"
                placeholder="พิมพ์รหัสหรือชื่อ แล้วกด Enter"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchResults.length > 0) {
                    e.preventDefault();
                    void selectStudent(searchResults[0]);
                  }
                }}
              />

              {/* Secondary — browse by grade/classroom */}
              <details className="group">
                <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                  <span className="group-open:hidden">▸ หรือเลือกตามชั้น/ห้อง</span>
                  <span className="hidden group-open:inline">▾ เลือกตามชั้น/ห้อง</span>
                </summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Select
                    value={searchGrade}
                    onValueChange={(v) => {
                      setSearchGrade(v ?? "all");
                      setSearchClassroom("all");
                    }}
                    items={gradeItems}
                  >
                    <SelectTrigger>
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
                    value={searchClassroom}
                    onValueChange={(v) => setSearchClassroom(v ?? "all")}
                    items={searchClassroomItems}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="ห้อง" />
                    </SelectTrigger>
                    <SelectContent>
                      {searchClassroomItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </details>

              {searchResults.length > 0 ? (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {searchResults.map((s, i) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50",
                          i === 0 && "bg-primary/5",
                        )}
                        onClick={() => selectStudent(s)}
                      >
                        <span className="flex flex-col items-start">
                          <span className="font-medium tabular-nums">{s.studentCode}</span>
                          <span>{s.name}</span>
                          <span className="text-xs text-muted-foreground">{s.gradeClassroom}</span>
                        </span>
                        {i === 0 ? (
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            Enter ↵
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : searchGrade !== "all" || searchClassroom !== "all" || searchQuery.trim().length >= 2 ? (
                <p className="text-sm text-muted-foreground">ไม่พบนักเรียน</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">รับชำระเงิน</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  นำเข้า CSV
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedStudent && lastPayment ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                      <p className="font-medium text-emerald-800">✓ บันทึกการชำระแล้ว</p>
                      <p className="mt-0.5 text-emerald-700">
                        ใบเสร็จ {lastPayment.receiptNumber} · {formatBaht(lastPayment.amount)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => printReceipt(lastPayment.id)}
                      >
                        🖨 พิมพ์ซ้ำ
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 text-destructive"
                        onClick={() => {
                          const row = filteredPayments.find((p) => p.id === lastPayment.id);
                          if (row) setVoidTarget(row);
                        }}
                      >
                        ยกเลิกการชำระนี้
                      </Button>
                    </div>
                    <p className="text-center text-xs text-muted-foreground">หรือค้นหานักเรียนรายถัดไป</p>
                  </div>
                ) : !selectedStudent ? (
                  <p className="text-sm text-muted-foreground">เลือกนักเรียนจากการค้นหาด้านซ้าย</p>
                ) : (
                  <>
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                      <p className="font-medium">
                        {selectedStudent.studentCode} {selectedStudent.name}
                      </p>
                      <p className="text-muted-foreground">{selectedStudent.gradeClassroom}</p>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ใบแจ้ง</TableHead>
                          <TableHead className="text-right">ค้าง</TableHead>
                          <TableHead className="text-right" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {outstanding.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-muted-foreground">
                              ไม่มีใบค้างชำระ
                            </TableCell>
                          </TableRow>
                        ) : (
                          outstanding.map((inv) => (
                            <Fragment key={inv.id}>
                              <TableRow>
                                <TableCell className="font-medium">{inv.invoiceName}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatBaht(inv.outstanding)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={selectedInvoice?.id === inv.id ? "default" : "outline"}
                                    onClick={() => {
                                      setSelectedInvoice(inv);
                                      setLineDiscounts({});
                                      setAmount(String(inv.outstanding));
                                      setTimeout(() => {
                                        amountInputRef.current?.focus();
                                        amountInputRef.current?.select();
                                      }, 50);
                                    }}
                                  >
                                    ชำระ
                                  </Button>
                                </TableCell>
                              </TableRow>
                              {inv.lines.map((line) => {
                                const isSelected = selectedInvoice?.id === inv.id;
                                const d = lineDiscounts[line.id] ?? { value: "", unit: "fixed" as const };
                                const resolved = isSelected ? resolveOne(line.amount, d) : 0;
                                return (
                                  <TableRow key={line.id} className="border-0">
                                    <TableCell className="py-0.5 pl-5 text-xs break-words text-muted-foreground">
                                      · {line.description}
                                    </TableCell>
                                    <TableCell className="py-0.5 text-right text-xs tabular-nums text-muted-foreground">
                                      {isSelected ? (
                                        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                                          {resolved > 0 ? (
                                            <span className="shrink-0 text-[10px] text-green-700">
                                              −{formatBaht(resolved)}
                                            </span>
                                          ) : null}
                                          <Input
                                            value={d.value}
                                            onChange={(e) =>
                                              setLineDiscounts((prev) => ({
                                                ...prev,
                                                [line.id]: { value: e.target.value, unit: d.unit },
                                              }))
                                            }
                                            placeholder="ส่วนลด"
                                            className="h-6 w-24 shrink-0 text-right text-xs"
                                          />
                                          <button
                                            type="button"
                                            className="w-6 shrink-0 text-[10px] text-primary hover:underline"
                                            onClick={() =>
                                              setLineDiscounts((prev) => ({
                                                ...prev,
                                                [line.id]: {
                                                  value: d.value,
                                                  unit: d.unit === "fixed" ? "percent" : "fixed",
                                                },
                                              }))
                                            }
                                          >
                                            {d.unit === "fixed" ? "บาท" : "%"}
                                          </button>
                                          <span className="w-16 shrink-0 text-right tabular-nums">
                                            {formatBaht(line.amount)}
                                          </span>
                                        </div>
                                      ) : (
                                        formatBaht(line.amount)
                                      )}
                                    </TableCell>
                                    <TableCell />
                                  </TableRow>
                                );
                              })}
                            </Fragment>
                          ))
                        )}
                      </TableBody>
                    </Table>

                    {hasDiscount ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">ส่วนลดรวม</span>
                        <span className="tabular-nums text-green-700">−{formatBaht(totalDiscount)}</span>
                      </div>
                    ) : null}

                    {selectedInvoice ? (
                      <p className="text-sm">
                        กำลังชำระ: <span className="font-medium">{selectedInvoice.invoiceName}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">เลือกใบแจ้งที่จะชำระจากตารางด้านบน</p>
                    )}

                    {/* Shared-row grid: labels in row 1, fields in row 2 — fields
                        share the same row track so they always align regardless
                        of label height. */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      {/* row 1 — labels */}
                      <div className="flex items-center justify-between">
                        <Label htmlFor="pay-amount">จำนวนเงิน (บาท)</Label>
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline disabled:opacity-50"
                          disabled={!selectedInvoice || selectedOutstanding <= 0 || hasDiscount}
                          onClick={() => setAmount(String(selectedOutstanding))}
                        >
                          ชำระเต็มจำนวน
                        </button>
                      </div>
                      <div className="flex items-center">
                        <Label>วิธีชำระ</Label>
                      </div>

                      {/* row 2 — fields */}
                      <Input
                        ref={amountInputRef}
                        id="pay-amount"
                        type="number"
                        min={0}
                        step="0.01"
                        value={effectiveAmount}
                        onChange={(e) => setAmount(e.target.value)}
                        readOnly={hasDiscount}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (!submitting && selectedInvoice && !amountExceeds) {
                              requestRecord();
                            }
                          }
                        }}
                        className="tabular-nums"
                        aria-invalid={amountExceeds}
                      />
                      <Select
                        value={method}
                        onValueChange={(v) => setMethod(v as "cash" | "transfer")}
                        items={methodItems}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {methodItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* row 3 — helper text under amount only */}
                      <p
                        className={cn(
                          "col-start-1 text-xs",
                          amountExceeds ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {amountExceeds
                          ? `เกินยอดค้าง (${formatBaht(selectedOutstanding)})`
                          : `ยอดค้าง ${formatBaht(selectedOutstanding)}`}
                      </p>
                    </div>

                    {method === "transfer" ? (
                      <div className="grid gap-2">
                        <Label htmlFor="transfer-ref">เลขอ้างอิงโอน</Label>
                        <Input
                          id="transfer-ref"
                          value={transferRef}
                          onChange={(e) => setTransferRef(e.target.value)}
                        />
                      </div>
                    ) : null}

                    <div className="grid gap-2">
                      <Label htmlFor="pay-note">หมายเหตุ</Label>
                      <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
                    </div>

                    <Button
                      type="button"
                      className="w-full"
                      onClick={requestRecord}
                      disabled={submitting || !selectedInvoice || amountExceeds || !(parsedAmount > 0)}
                    >
                      บันทึกและออกใบเสร็จ
                    </Button>
                  </>
                )}
                </CardContent>
            </Card>
          </div>

          <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">รายการการชำระ</CardTitle>
                  <div className="flex flex-wrap gap-2">
                  <Select
                    value={gradeParam}
                    onValueChange={(v) =>
                      pushParams({ grade: v ?? "all", classroom: "all" })
                    }
                    items={gradeItems}
                  >
                    <SelectTrigger className="w-[140px]">
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
                    onValueChange={(v) => pushParams({ classroom: v ?? "all" })}
                    items={classroomItems}
                  >
                    <SelectTrigger className="w-[160px]">
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
              </div>
              <input
                type="text"
                value={paymentSearch}
                onChange={(e) => setPaymentSearch(e.target.value)}
                placeholder="ค้นหาชื่อ / รหัสนักเรียน…"
                className="h-8 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 sm:max-w-xs"
              />
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {/* Mobile stacked cards */}
                {displayedPayments.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground sm:hidden">
                    ไม่พบรายการการชำระ
                  </p>
                ) : (
                  <div className="sm:hidden divide-y divide-border">
                    {displayedPayments.map((p) => (
                      <div key={p.id} className="space-y-2 px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{p.studentName}</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {p.paidAtLabel} · {PAYMENT_METHOD_LABELS[p.paymentMethod]}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="font-semibold tabular-nums">
                              {formatBaht(p.amount)}
                            </span>
                            {p.status === "active" ? (
                              <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                                ปกติ
                              </Badge>
                            ) : (
                              <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">ยกเลิก</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <a href={`/receipts/${p.id}`} target="_blank" rel="noopener noreferrer">
                            <Button type="button" size="sm" variant="outline">
                              ใบเสร็จ
                            </Button>
                          </a>
                          {p.status === "active" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-destructive"
                              onClick={() => setVoidTarget(p)}
                            >
                              ยกเลิก
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Desktop table */}
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>เลขที่</TableHead>
                        <TableHead>รหัส</TableHead>
                        <TableHead>นักเรียน</TableHead>
                        <TableHead>ชั้น/ห้อง</TableHead>
                        <TableHead>วันที่</TableHead>
                        <TableHead>วิธี</TableHead>
                        <TableHead className="text-right">จำนวน</TableHead>
                        <TableHead>สถานะ</TableHead>
                        <TableHead className="text-right">จัดการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedPayments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                            ไม่พบรายการการชำระ
                          </TableCell>
                        </TableRow>
                      ) : (
                        displayedPayments.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="tabular-nums">{p.receiptNumber}</TableCell>
                            <TableCell className="tabular-nums">{p.studentCode}</TableCell>
                            <TableCell>{p.studentName}</TableCell>
                            <TableCell className="text-muted-foreground">{p.gradeClassroom}</TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {p.paidAtLabel}
                            </TableCell>
                            <TableCell>{PAYMENT_METHOD_LABELS[p.paymentMethod]}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatBaht(p.amount)}
                            </TableCell>
                            <TableCell>
                              {p.status === "active" ? (
                                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                                  ปกติ
                                </Badge>
                              ) : (
                                <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">ยกเลิก</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <a href={`/receipts/${p.id}`} target="_blank" rel="noopener noreferrer">
                                  <Button type="button" size="sm" variant="outline">
                                    ใบเสร็จ
                                  </Button>
                                </a>
                                {p.status === "active" ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive"
                                    onClick={() => setVoidTarget(p)}
                                  >
                                    ยกเลิก
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

          <AlertDialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ยืนยันรับชำระเงิน</AlertDialogTitle>
                <AlertDialogDescription>
                  {selectedStudent?.studentCode} {selectedStudent?.name}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                {hasDiscount ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ส่วนลด</span>
                    <span className="tabular-nums text-green-700">−{formatBaht(totalDiscount)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">จำนวนเงิน</span>
                  <span className="font-semibold tabular-nums">
                    {formatBaht(Number.parseFloat(effectiveAmount) || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">วิธีชำระ</span>
                  <span>{PAYMENT_METHOD_LABELS[method]}</span>
                </div>
                {method === "transfer" && transferRef ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">เลขอ้างอิงโอน</span>
                    <span className="tabular-nums">{transferRef}</span>
                  </div>
                ) : null}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={submitting}>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction autoFocus onClick={handleRecord} disabled={submitting}>
                  {submitting ? "กำลังบันทึก..." : "ยืนยัน ออกใบเสร็จ"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={Boolean(voidTarget)} onOpenChange={(o) => !o && setVoidTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ยกเลิกใบเสร็จ</AlertDialogTitle>
                <AlertDialogDescription>
                  ยกเลิกเลขที่ {voidTarget?.receiptNumber} — ระบุเหตุผลเพื่อ audit
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-2">
                <Input
                  placeholder="เหตุผล"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={voiding}>ปิด</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={handleVoid}
                  disabled={voiding}
                >
                  {voiding ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {ctx ? (
            <PaymentImportDialog
              open={importOpen}
              onOpenChange={setImportOpen}
              academicYearId={ctx.academicYearId}
              academicYearName={ctx.academicYearName}
              semesterId={ctx.semesterId}
              onImported={() => {
                void queryClient.invalidateQueries({ queryKey: ["payments"] });
                void queryClient.invalidateQueries({ queryKey: ["invoices"] });
                void queryClient.invalidateQueries({ queryKey: ["invoice-candidates"] });
                router.refresh();
              }}
            />
          ) : null}
        </div>
      </main>

      {/* Hidden iframe for popup-free receipt printing */}
      <iframe
        ref={receiptIframeRef}
        title="พิมพ์ใบเสร็จ"
        aria-hidden="true"
        style={{ position: "fixed", right: 0, bottom: 0, width: 0, height: 0, border: 0 }}
      />
    </>
  );
}

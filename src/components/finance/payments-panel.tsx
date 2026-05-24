"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { ReceiptDialog } from "@/components/finance/receipt-dialog";
import { formatBaht } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/constants";
import {
  getStudentOutstandingAction,
  recordPayment,
  searchStudentsForPaymentAction,
  voidPayment,
} from "@/lib/actions/payments";
import type { OutstandingInvoiceRow } from "@/lib/data/invoices";
import type { PaymentListRow } from "@/lib/data/payments";
import type { GradeLevelRow } from "@/lib/data/grade-levels";
import type { ClassroomWithGradeRow } from "@/lib/data/classrooms";

type PaymentsPanelProps = {
  context: {
    semesterId: string;
    academicYearId: string;
    academicYearName: string;
  };
  params: {
    grade: string;
    classroom: string;
  };
  grades: GradeLevelRow[];
  classrooms: ClassroomWithGradeRow[];
  filteredPayments: PaymentListRow[];
};

const methodItems = [
  { value: "cash", label: PAYMENT_METHOD_LABELS.cash },
  { value: "transfer", label: PAYMENT_METHOD_LABELS.transfer },
];

export function PaymentsPanel({
  context,
  params,
  grades,
  classrooms,
  filteredPayments,
}: PaymentsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
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
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [transferRef, setTransferRef] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receiptSnapshot, setReceiptSnapshot] = useState<Record<string, unknown> | null>(
    null,
  );
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<PaymentListRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  const gradeItems = [
    { value: "all", label: "ทุกชั้น" },
    ...grades.map((g) => ({ value: g.id, label: g.name })),
  ];

  const classroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => params.grade === "all" || c.grade_level_id === params.grade)
      .map((c) => ({ value: c.id, label: `${c.grade_name}/${c.name}` })),
  ];

  const searchClassroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => searchGrade === "all" || c.grade_level_id === searchGrade)
      .map((c) => ({ value: c.id, label: `${c.grade_name}/${c.name}` })),
  ];

  const pushParams = useCallback(
    (next: Partial<PaymentsPanelProps["params"]>) => {
      const query = new URLSearchParams();
      const grade = next.grade ?? params.grade;
      const classroom = next.classroom ?? params.classroom;

      if (grade && grade !== "all") query.set("grade", grade);
      if (classroom && classroom !== "all") query.set("classroom", classroom);

      const yearSemester = new URLSearchParams(window.location.search);
      if (yearSemester.get("year")) query.set("year", yearSemester.get("year")!);
      if (yearSemester.get("semester")) query.set("semester", yearSemester.get("semester")!);

      router.push(`${pathname}?${query.toString()}`);
    },
    [params, pathname, router],
  );

  useEffect(() => {
    const q = searchQuery.trim();
    const hasScope = searchGrade !== "all" || searchClassroom !== "all";

    if (q.length < 2 && !hasScope) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      const result = await searchStudentsForPaymentAction(context.semesterId, {
        query: q.length >= 2 ? q : undefined,
        gradeLevelId: searchGrade !== "all" ? searchGrade : undefined,
        classroomId: searchClassroom !== "all" ? searchClassroom : undefined,
      });
      if (result.ok) setSearchResults(result.students);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchGrade, searchClassroom, context.semesterId]);

  async function selectStudent(student: (typeof searchResults)[number]) {
    setSelectedStudent(student);
    setSearchQuery("");
    setSearchResults([]);

    const result = await getStudentOutstandingAction(student.id, context.semesterId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setOutstanding(result.invoices);
    const totalDue = result.invoices.reduce((sum, r) => sum + r.outstanding, 0);
    setAmount(totalDue > 0 ? String(totalDue) : "");
  }

  async function handleRecord() {
    if (!selectedStudent) return;
    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("กรุณาระบุจำนวนเงิน");
      return;
    }

    setSubmitting(true);
    const result = await recordPayment({
      studentId: selectedStudent.id,
      academicYearId: context.academicYearId,
      academicYearName: context.academicYearName,
      semesterId: context.semesterId,
      amount: parsedAmount,
      paymentMethod: method,
      transferReference: method === "transfer" ? transferRef : undefined,
      note,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success("บันทึกการชำระและออกใบเสร็จแล้ว");
    setReceiptSnapshot(result.snapshot);
    setReceiptOpen(true);
    setSelectedStudent(null);
    setOutstanding([]);
    setAmount("");
    setNote("");
    setTransferRef("");
    router.refresh();
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
    router.refresh();
  }

  function openReprint(payment: PaymentListRow) {
    if (!payment.snapshot) {
      toast.error("ไม่พบข้อมูลใบเสร็จ");
      return;
    }
    setReceiptSnapshot(payment.snapshot);
    setReceiptOpen(true);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">ค้นหานักเรียน</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
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
          <Input
            placeholder="รหัสหรือชื่อ (ไม่บังคับเมื่อเลือกชั้น/ห้อง)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchResults.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {searchResults.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted/50"
                    onClick={() => selectStudent(s)}
                  >
                    <span className="font-medium tabular-nums">{s.studentCode}</span>
                    <span>{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.gradeClassroom}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : searchGrade !== "all" || searchClassroom !== "all" || searchQuery.trim().length >= 2 ? (
            <p className="text-sm text-muted-foreground">ไม่พบนักเรียน</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">รับชำระเงิน</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedStudent ? (
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outstanding.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground">
                          ไม่มีใบค้างชำระ
                        </TableCell>
                      </TableRow>
                    ) : (
                      outstanding.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell>{inv.invoiceName}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatBaht(inv.outstanding)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="pay-amount">จำนวนเงิน (บาท)</Label>
                    <Input
                      id="pay-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="tabular-nums"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>วิธีชำระ</Label>
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
                  </div>
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
                  className="w-full bg-amber-600 hover:bg-amber-700"
                  onClick={handleRecord}
                  disabled={submitting || outstanding.length === 0}
                >
                  {submitting ? "กำลังบันทึก..." : "บันทึกและออกใบเสร็จ"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">รายการการชำระ</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select
                value={params.grade}
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
                value={params.classroom}
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
          </CardHeader>
          <CardContent className="px-0 pb-0">
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
                {filteredPayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                      ไม่พบรายการการชำระตามตัวกรอง
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPayments.map((p) => (
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
                          <Badge variant="outline">ยกเลิก</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openReprint(p)}
                          >
                            พิมพ์ซ้ำ
                          </Button>
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
          </CardContent>
        </Card>
      </div>

      <ReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        snapshot={receiptSnapshot}
      />

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
    </div>
  );
}

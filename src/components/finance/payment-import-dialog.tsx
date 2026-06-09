"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht, formatThaiDate } from "@/lib/format";
import { assessImportRow, parsePaymentCsv, type ImportRowStatus } from "@/lib/finance/csv-import";
import {
  getImportPreviewDataAction,
  importPaymentsBackfill,
  type ImportRowInput,
} from "@/lib/actions/payments";
import { cn } from "@/lib/utils";

type PreviewRow = {
  lineNumber: number;
  studentCode: string;
  csvName: string;
  systemName: string | null;
  amount: number;
  outstanding: number | null;
  paidDateIso: string;
  status: ImportRowStatus;
  nameMismatch: boolean;
  willImport: boolean;
};

const STATUS_LABEL: Record<ImportRowStatus, string> = {
  full: "ชำระเต็ม",
  partial: "ชำระบางส่วน",
  format_error: "รูปแบบผิด",
  not_found: "ไม่พบรหัส",
  over: "ยอดเกินค้าง",
  no_outstanding: "ไม่มียอดค้าง",
};

const STATUS_CLASS: Record<ImportRowStatus, string> = {
  full: "text-emerald-700",
  partial: "text-sky-700",
  format_error: "text-destructive",
  not_found: "text-destructive",
  over: "text-destructive",
  no_outstanding: "text-destructive",
};

const TEMPLATE_CSV =
  "student_code,student_name,amount,paid_date\n14333,นาลันทา ศรีวัฒนพงศ์,3600,06/05/2569\n";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  onImported: () => void;
};

export function PaymentImportDialog({
  open,
  onOpenChange,
  academicYearId,
  academicYearName,
  semesterId,
  onImported,
}: Props) {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setRows([]);
    setParsing(false);
    setSubmitting(false);
  }

  function downloadTemplate() {
    const blob = new Blob(["﻿" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payment-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);

    const text = await file.text();
    const parsed = parsePaymentCsv(text);

    const codes = parsed.map((r) => r.studentCode).filter(Boolean);
    const preview = await getImportPreviewDataAction(codes, semesterId);
    if (!preview.ok) {
      toast.error(preview.error);
      setParsing(false);
      return;
    }
    const byCode = new Map(preview.students.map((s) => [s.studentCode, s]));

    const assessed: PreviewRow[] = parsed.map((r) => {
      const match = byCode.get(r.studentCode) ?? null;
      const a = assessImportRow({
        parseError: r.error,
        matchedStudentId: match?.studentId ?? null,
        systemName: match?.name ?? null,
        csvName: r.studentName,
        amount: r.amount,
        outstanding: match?.outstanding ?? null,
      });
      return {
        lineNumber: r.lineNumber,
        studentCode: r.studentCode,
        csvName: r.studentName,
        systemName: match?.name ?? null,
        amount: r.amount,
        outstanding: match?.outstanding ?? null,
        paidDateIso: r.paidDateIso,
        status: a.status,
        nameMismatch: a.nameMismatch,
        willImport: a.willImport,
      };
    });

    setRows(assessed);
    setParsing(false);
    e.target.value = "";
  }

  async function handleConfirm() {
    const importable: ImportRowInput[] = rows
      .filter((r) => r.willImport)
      .map((r) => ({
        lineNumber: r.lineNumber,
        studentCode: r.studentCode,
        csvName: r.csvName,
        amount: r.amount,
        paidDateIso: r.paidDateIso,
      }));

    if (importable.length === 0) {
      toast.error("ไม่มีรายการที่นำเข้าได้");
      return;
    }

    setSubmitting(true);
    const result = await importPaymentsBackfill({
      rows: importable,
      academicYearId,
      academicYearName,
      semesterId,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`นำเข้าสำเร็จ ${result.imported} รายการ${result.failed.length ? ` · ล้มเหลว ${result.failed.length}` : ""}`);
    reset();
    onOpenChange(false);
    onImported();
  }

  const willImportCount = rows.filter((r) => r.willImport).length;
  const skipCount = rows.length - willImportCount;
  const totalAmount = rows.filter((r) => r.willImport).reduce((sum, r) => sum + r.amount, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>นำเข้าการชำระเงินจาก CSV</DialogTitle>
          <DialogDescription>
            ไฟล์ต้องมีคอลัมน์: รหัส, ชื่อ, ยอดชำระ, วันที่ (พ.ศ. วว/ดด/ปปปป)
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2">
          <input type="file" accept=".csv,text/csv" onChange={handleFile} disabled={parsing || submitting} />
          <button type="button" className="text-sm text-primary hover:underline" onClick={downloadTemplate}>
            ดาวน์โหลดเทมเพลต
          </button>
        </div>

        {rows.length > 0 ? (
          <>
            <div className="max-h-[50vh] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>รหัส</TableHead>
                    <TableHead>ชื่อใน CSV</TableHead>
                    <TableHead>ชื่อในระบบ</TableHead>
                    <TableHead className="text-right">ยอดชำระ</TableHead>
                    <TableHead className="text-right">ยอดค้าง</TableHead>
                    <TableHead>วันที่</TableHead>
                    <TableHead>สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.lineNumber}>
                      <TableCell className="tabular-nums">{r.studentCode}</TableCell>
                      <TableCell>{r.csvName}</TableCell>
                      <TableCell className={cn(r.nameMismatch && "text-amber-600")}>
                        {r.systemName ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(r.amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.outstanding === null ? "—" : formatBaht(r.outstanding)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.paidDateIso ? formatThaiDate(`${r.paidDateIso}T12:00:00+07:00`) : "—"}
                      </TableCell>
                      <TableCell className={cn("whitespace-nowrap", STATUS_CLASS[r.status])}>
                        {STATUS_LABEL[r.status]}
                        {r.nameMismatch && r.willImport ? " ⚠" : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-sm text-muted-foreground">
              พร้อมนำเข้า {willImportCount} รายการ · ข้าม {skipCount} รายการ · ยอดรวม {formatBaht(totalAmount)}
            </p>
          </>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button type="button" disabled={submitting || parsing || willImportCount === 0} onClick={handleConfirm}>
            {submitting ? "กำลังนำเข้า..." : `ยืนยันนำเข้า ${willImportCount} รายการ`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

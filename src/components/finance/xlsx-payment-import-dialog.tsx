"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
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
import {
  buildImportGroups,
  parseXlsxWorkbook,
  validateGroup,
  type ImportGroup,
} from "@/lib/finance/xlsx-import";
import {
  SAMPLE_XLSX_FILENAME,
  XLSX_FORMAT_TABLE,
  buildSampleXlsxWorkbook,
} from "@/lib/finance/xlsx-format";
import {
  getXlsxImportPreviewAction,
  importPaymentsXlsxBackfill,
  type XlsxImportGroupInput,
} from "@/lib/actions/payments";
import { cn } from "@/lib/utils";

type PreviewGroup = ImportGroup & {
  studentId: string | null;
  invoiceId: string | null;
  willImport: boolean;
  reason: string | null;
};

const KIND_LABEL: Record<ImportGroup["kind"], string> = {
  tuition: "ค่าธรรมเนียมการศึกษา",
  insurance: "ค่าประกันอุบัติเหตุ",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYearId: string;
  academicYearName: string;
  semesterId: string;
  onImported: () => void;
};

export function XlsxPaymentImportDialog({
  open,
  onOpenChange,
  academicYearId,
  academicYearName,
  semesterId,
  onImported,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [groups, setGroups] = useState<PreviewGroup[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setGroups([]);
    setParsing(false);
    setSubmitting(false);
  }

  function downloadSampleXlsx() {
    const workbook = buildSampleXlsxWorkbook();
    XLSX.writeFile(workbook, SAMPLE_XLSX_FILENAME);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);

    let rawGroups: ImportGroup[];
    try {
      const buffer = await file.arrayBuffer();
      const sheetRows = parseXlsxWorkbook(buffer);
      rawGroups = sheetRows.flatMap(buildImportGroups);
    } catch {
      toast.error("ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบว่าเป็นไฟล์ .xlsx ที่ถูกต้อง");
      setParsing(false);
      e.target.value = "";
      return;
    }

    const codes = [...new Set(rawGroups.map((g) => g.studentCode))];
    const preview = await getXlsxImportPreviewAction(codes, semesterId);
    if (!preview.ok) {
      toast.error(preview.error);
      setParsing(false);
      return;
    }
    const byCode = new Map(preview.students.map((s) => [s.studentCode, s]));

    const assessed: PreviewGroup[] = rawGroups.map((group) => {
      const student = byCode.get(group.studentCode);
      if (!student) {
        return { ...group, studentId: null, invoiceId: null, willImport: false, reason: "ไม่พบรหัสนักเรียน" };
      }
      if (!group.paidDateIso) {
        return { ...group, studentId: student.studentId, invoiceId: null, willImport: false, reason: "วันที่ไม่ถูกต้อง" };
      }
      const result = validateGroup(group, student.invoices);
      if (!result.ok) {
        return { ...group, studentId: student.studentId, invoiceId: null, willImport: false, reason: result.reason };
      }
      return { ...group, studentId: student.studentId, invoiceId: result.invoiceId, willImport: true, reason: null };
    });

    setGroups(assessed);
    setParsing(false);
    e.target.value = "";
  }

  async function handleConfirm() {
    const importable: XlsxImportGroupInput[] = groups
      .filter((g) => g.willImport && g.studentId && g.invoiceId)
      .map((g) => ({
        rowNumber: g.rowNumber,
        kind: g.kind,
        invoiceId: g.invoiceId!,
        studentId: g.studentId!,
        studentCode: g.studentCode,
        netCash: g.netCash,
        discount: g.discount,
        discountLines: g.discountLines,
        voucher: g.voucher,
        paidDateIso: g.paidDateIso!,
      }));

    if (importable.length === 0) {
      toast.error("ไม่มีรายการที่นำเข้าได้");
      return;
    }

    setSubmitting(true);
    const result = await importPaymentsXlsxBackfill({
      groups: importable,
      academicYearId,
      academicYearName,
      semesterId,
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(
      `นำเข้าสำเร็จ ${result.imported} รายการ${result.failed.length ? ` · ล้มเหลว ${result.failed.length}` : ""}`,
    );
    reset();
    onOpenChange(false);
    onImported();
  }

  const willImportCount = groups.filter((g) => g.willImport).length;
  const skipCount = groups.length - willImportCount;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>นำเข้าการชำระเงินจาก XLSX</DialogTitle>
          <DialogDescription>
            ไฟล์รูปแบบใบบันทึกการชำระรายห้อง — แถว 1 คือชื่อห้อง, แถว 3 คือหัวคอลัมน์, แถว 4 เป็นต้นไปคือข้อมูลนักเรียน ใส่ตัวเลขติดลบสำหรับส่วนลด เช่น -200
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="overflow-x-auto rounded-md border">
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>คอลัมน์</TableHead>
                  <TableHead>คำอธิบาย</TableHead>
                  <TableHead>ตัวอย่าง</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {XLSX_FORMAT_TABLE.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-mono text-xs">{row.key}</TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell className="text-muted-foreground">{row.example}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={downloadSampleXlsx}>
              ดาวน์โหลดไฟล์ตัวอย่าง
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={parsing || submitting}
              onClick={() => fileInputRef.current?.click()}
            >
              เลือกไฟล์ XLSX
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          {groups.length > 0 ? (
            <>
              <div className="max-h-[50vh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>แถว</TableHead>
                      <TableHead>รหัส</TableHead>
                      <TableHead>ชื่อ</TableHead>
                      <TableHead>ประเภท</TableHead>
                      <TableHead className="text-right">เงินสด</TableHead>
                      <TableHead className="text-right">ส่วนลด</TableHead>
                      <TableHead>วันที่</TableHead>
                      <TableHead>สถานะ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((g, i) => (
                      <TableRow key={`${g.rowNumber}-${g.kind}-${i}`}>
                        <TableCell className="tabular-nums">{g.rowNumber}</TableCell>
                        <TableCell className="tabular-nums">{g.studentCode}</TableCell>
                        <TableCell>{g.studentName}</TableCell>
                        <TableCell>{KIND_LABEL[g.kind]}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBaht(g.netCash)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {g.discount > 0 ? formatBaht(g.discount) : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {g.paidDateIso ? formatThaiDate(`${g.paidDateIso}T12:00:00+07:00`) : "—"}
                        </TableCell>
                        <TableCell
                          className={cn("whitespace-nowrap", g.willImport ? "text-emerald-700" : "text-destructive")}
                        >
                          {g.willImport ? "จะนำเข้า" : `ข้าม — ${g.reason}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-sm text-muted-foreground">
                พร้อมนำเข้า {willImportCount} รายการ · ข้าม {skipCount} รายการ
              </p>
            </>
          ) : null}
        </div>

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

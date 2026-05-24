"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  confirmStudentCsvImport,
  previewStudentCsvImport,
  type ImportStudentPreview,
  type PreviewStudentCsvImportResult,
} from "@/lib/actions/students";
import {
  CSV_FORMAT_TABLE,
  CSV_IMPORT_MAX_ROWS,
  SAMPLE_CSV_CONTENT,
  SAMPLE_CSV_FILENAME,
} from "@/lib/students/csv-format";
import {
  assertRequiredHeaders,
  csvRowsToObjects,
  normalizeHeaderRow,
  parseCsvText,
  type ImportRowError,
  type ImportStudentRow,
} from "@/lib/students/csv-import";

type StudentImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ParsedState = {
  stats: { ready: number; errors: number };
  ready: ImportStudentRow[];
  preview: ImportStudentPreview[];
  errors: ImportRowError[];
};

type ImportPhase = "setup" | "review";

function downloadSampleCsv() {
  const blob = new Blob([SAMPLE_CSV_CONTENT], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = SAMPLE_CSV_FILENAME;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function StudentImportDialog({ open, onOpenChange }: StudentImportDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<ImportPhase>("setup");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedState | null>(null);

  useEffect(() => {
    if (open) return;
    setPhase("setup");
    setParsing(false);
    setImporting(false);
    setParseError(null);
    setParsed(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [open]);

  function handleCancel() {
    setPhase("setup");
    setParsing(false);
    setParseError(null);
    setParsed(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhase("review");
    setParsing(true);
    setParseError(null);
    setParsed(null);

    try {
      const text = await file.text();
      const matrix = parseCsvText(text);
      if (matrix.length < 2) {
        setParseError("ไฟล์ไม่มีข้อมูลนักเรียน");
        return;
      }

      const header = normalizeHeaderRow(matrix[0]);
      const headerError = assertRequiredHeaders(header);
      if (headerError) {
        setParseError(headerError);
        return;
      }

      const dataRows = matrix.slice(1);
      if (dataRows.length > CSV_IMPORT_MAX_ROWS) {
        setParseError(`ไฟล์มีมากกว่า ${CSV_IMPORT_MAX_ROWS} แถว — กรุณาแบ่งไฟล์`);
        return;
      }

      const rows = csvRowsToObjects(header, dataRows);
      const result: PreviewStudentCsvImportResult = await previewStudentCsvImport(rows);
      if (!result.ok) {
        setParseError(result.error);
        return;
      }

      setParsed({
        stats: result.stats,
        ready: result.ready,
        preview: result.preview,
        errors: result.errors,
      });
    } catch {
      setParseError("ไม่สามารถอ่านไฟล์ได้");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleConfirm() {
    if (!parsed || parsed.ready.length === 0) return;

    setImporting(true);
    const result = await confirmStudentCsvImport(parsed.ready);
    setImporting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (result.imported === 0) {
      toast.error("ไม่สามารถนำเข้าได้ — กรุณาตรวจสอบรายการอีกครั้ง");
      return;
    }

    if (result.errors.length > 0) {
      toast.success(
        `นำเข้าแล้ว ${result.imported} คน (ข้าม ${result.errors.length} แถวที่มีปัญหา)`,
      );
    } else {
      toast.success(`นำเข้านักเรียนแล้ว ${result.imported} คน`);
    }

    onOpenChange(false);
    router.refresh();
  }

  const canConfirm = Boolean(parsed && parsed.ready.length > 0 && !importing);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>นำเข้านักเรียนจาก CSV</DialogTitle>
          <DialogDescription>
            {phase === "setup"
              ? "อัปโหลดไฟล์ตามรูปแบบด้านล่าง ระบบจะตรวจสอบก่อนนำเข้า"
              : "ตรวจสอบรายการก่อนยืนยันนำเข้า"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {phase === "setup" ? (
            <>
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
                    {CSV_FORMAT_TABLE.map((row) => (
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
                <Button type="button" variant="outline" onClick={downloadSampleCsv}>
                  ดาวน์โหลดไฟล์ตัวอย่าง
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={importing}
                  onClick={() => fileInputRef.current?.click()}
                >
                  เลือกไฟล์ CSV
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </>
          ) : null}

          {phase === "review" ? (
            <div className="space-y-4">
              {parsing ? (
                <p className="text-sm text-muted-foreground">กำลังตรวจสอบ...</p>
              ) : null}

              {parseError ? <p className="text-sm text-destructive">{parseError}</p> : null}

              {parsed ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    พร้อมนำเข้า {parsed.stats.ready} แถว
                    {parsed.stats.errors > 0 ? ` · มีข้อผิดพลาด ${parsed.stats.errors} แถว` : ""}
                  </p>

                  {parsed.errors.length > 0 ? (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">ข้อผิดพลาด</h3>
                      <div className="max-h-40 overflow-y-auto rounded-md border">
                        <Table className="w-full">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-16">แถว</TableHead>
                              <TableHead className="w-28">รหัส</TableHead>
                              <TableHead>รายละเอียด</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {parsed.errors.map((error) => (
                              <TableRow
                                key={`${error.row}-${error.studentCode ?? ""}-${error.message}`}
                              >
                                <TableCell>{error.row}</TableCell>
                                <TableCell>{error.studentCode ?? "—"}</TableCell>
                                <TableCell>{error.message}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : null}

                  {parsed.preview.length > 0 ? (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">
                        รายการที่จะนำเข้า ({parsed.preview.length} คน)
                      </h3>
                      <div className="max-h-96 overflow-auto rounded-md border">
                        <Table className="w-full">
                          <TableHeader>
                            <TableRow>
                              <TableHead>รหัส</TableHead>
                              <TableHead>เลขประชาชน</TableHead>
                              <TableHead>ชื่อ-นามสกุล</TableHead>
                              <TableHead>เพศ</TableHead>
                              <TableHead>วันเกิด</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {parsed.preview.map((row) => (
                              <TableRow key={row.studentCode}>
                                <TableCell className="font-medium tabular-nums">
                                  {row.studentCode}
                                </TableCell>
                                <TableCell className="tabular-nums">
                                  {row.idCard ?? "—"}
                                </TableCell>
                                <TableCell>{row.name}</TableCell>
                                <TableCell>{row.genderLabel}</TableCell>
                                <TableCell>{row.birthDateLabel}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {phase === "review" ? (
            <Button
              type="button"
              variant="outline"
              disabled={importing}
              onClick={handleCancel}
            >
              ยกเลิก
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          {phase === "review" ? (
            <Button type="button" disabled={!canConfirm} onClick={handleConfirm}>
              {importing ? "กำลังนำเข้า..." : "ยืนยันนำเข้า"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

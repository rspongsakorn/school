"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { InvoiceDiscountDialog } from "@/components/finance/invoice-discount-dialog";
import { InvoiceGenerateDialog } from "@/components/finance/invoice-generate-dialog";
import { StudentSearchInput } from "@/components/students/student-search-input";
import { formatBaht } from "@/lib/format";
import { INVOICE_STATUS_LABELS } from "@/lib/finance/constants";
import type { PaginatedInvoices, InvoiceListRow } from "@/lib/data/invoices";
import type { InvoiceCandidateRow } from "@/lib/data/invoices";
import type { FeeItemRow } from "@/lib/data/fee-items";
import type { GradeLevelRow } from "@/lib/data/grade-levels";
import type { ClassroomWithGradeRow } from "@/lib/data/classrooms";

const STATUS_FILTER_ITEMS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "unpaid", label: "ค้างชำระ" },
  { value: "partial", label: "ชำระบางส่วน" },
  { value: "paid", label: "ชำระแล้ว" },
];

type InvoicesPanelProps = {
  data: PaginatedInvoices;
  params: {
    q: string;
    status: string;
    grade: string;
    classroom: string;
    page: number;
  };
  feeItems: FeeItemRow[];
  candidates: InvoiceCandidateRow[];
  grades: GradeLevelRow[];
  classrooms: ClassroomWithGradeRow[];
  context: {
    semesterId: string;
    academicYearId: string;
    academicYearName: string;
    semesterNumber: number;
  };
};

function statusBadgeClass(status: InvoiceListRow["status"]) {
  if (status === "paid") return "bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  if (status === "partial") return "bg-amber-50 text-amber-700 hover:bg-amber-50";
  return "bg-red-50 text-red-700 hover:bg-red-50";
}

export function InvoicesPanel({
  data,
  params,
  feeItems,
  candidates,
  grades,
  classrooms,
  context,
}: InvoicesPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [discountTarget, setDiscountTarget] = useState<InvoiceListRow | null>(null);

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

  const pushParams = useCallback(
    (next: Partial<InvoicesPanelProps["params"]>) => {
      const query = new URLSearchParams();
      const q = (next.q ?? params.q).trim();
      const status = next.status ?? params.status;
      const grade = next.grade ?? params.grade;
      const classroom = next.classroom ?? params.classroom;
      const page = next.page ?? params.page;

      if (q) query.set("q", q);
      if (status && status !== "all") query.set("status", status);
      if (grade && grade !== "all") query.set("grade", grade);
      if (classroom && classroom !== "all") query.set("classroom", classroom);
      query.set("page", String(Math.max(1, page)));

      const yearSemester = new URLSearchParams(window.location.search);
      if (yearSemester.get("year")) query.set("year", yearSemester.get("year")!);
      if (yearSemester.get("semester")) query.set("semester", yearSemester.get("semester")!);

      router.push(`${pathname}?${query.toString()}`);
    },
    [params, pathname, router],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap gap-2">
          <StudentSearchInput
            key={params.q}
            initialQuery={params.q}
            onDebouncedChange={(q) => pushParams({ q, page: 1 })}
          />
          <Select
            value={params.status}
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
            value={params.grade}
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
            value={params.classroom}
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
        <Button type="button" onClick={() => setGenerateOpen(true)}>
          สร้างใบแจ้งชำระ
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัส</TableHead>
            <TableHead>ชื่อ-นามสกุล</TableHead>
            <TableHead>ชั้น/ห้อง</TableHead>
            <TableHead>ใบแจ้ง</TableHead>
            <TableHead className="text-right">ต้องชำระ</TableHead>
            <TableHead className="text-right">ค้าง</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead className="w-[100px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                ไม่พบใบแจ้งชำระ
              </TableCell>
            </TableRow>
          ) : (
            data.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                <TableCell>{row.studentName}</TableCell>
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
                  {row.paidAmount === 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDiscountTarget(row)}
                    >
                      ส่วนลด
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

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
        semesterId={context.semesterId}
        academicYearId={context.academicYearId}
        academicYearName={context.academicYearName}
        semesterNumber={context.semesterNumber}
        feeItems={feeItems}
        candidates={candidates}
      />

      <InvoiceDiscountDialog
        open={Boolean(discountTarget)}
        onOpenChange={(open) => !open && setDiscountTarget(null)}
        invoice={discountTarget}
      />
    </div>
  );
}

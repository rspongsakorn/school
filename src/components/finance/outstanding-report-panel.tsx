"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useAuth, useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchOutstandingReport } from "@/lib/queries/reports";
import { fetchGradeLevels, fetchClassroomsBySemester } from "@/lib/queries/classrooms";
import { fetchInvoiceTypes } from "@/lib/queries/invoice-types";
import {
  PRICE_TIERS,
  parsePriceTier,
  priceTierBadgeClass,
  priceTierLabel,
  type PriceTier,
} from "@/lib/finance/price-tier";
import { Badge } from "@/components/ui/badge";
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
import { compareGradeLevelNames, formatBaht, formatThaiDate } from "@/lib/format";
import { INVOICE_STATUS_LABELS } from "@/lib/finance/constants";
import {
  OUTSTANDING_STATUS_ITEMS,
  outstandingStatusQuery,
  owedInvoices,
  parseOutstandingStatus,
} from "@/lib/reports/outstanding-status";
import { pickQuery, rosterQueryFromOutstanding } from "@/lib/reports/url-filters";
import { ReportToolbar } from "@/components/finance/report-toolbar";
import { ReportLetterhead } from "@/components/finance/report-letterhead";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { LEGACY_OUTSTANDING_LABEL } from "@/lib/finance/line-payment";
import { cn } from "@/lib/utils";

const REIMBURSABLE_ITEMS = [
  { value: "all", label: "ทุกประเภท" },
  ...PRICE_TIERS.map((tier) => ({ value: tier, label: priceTierLabel(tier) })),
];

/** "รายการที่ค้าง" cell: wraps; the unknown-lines label is muted. */
function unpaidLinesClass(label: string, extra = "text-sm"): string {
  return cn(
    "whitespace-normal break-words",
    extra,
    label === LEGACY_OUTSTANDING_LABEL ? "text-muted-foreground" : "text-amber-700",
  );
}

function formatDiscount(discountType: "fixed" | "percent" | null, discountValue: number | null): string | null {
  if (!discountType || discountValue == null) return null;
  return discountType === "percent" ? `ลด ${discountValue}%` : `ลด ${formatBaht(discountValue)}`;
}

const STATUS_BADGE_CLASSES: Record<"unpaid" | "partial" | "paid", string> = {
  paid: "border-transparent bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  partial: "border-transparent bg-amber-50 text-amber-700 hover:bg-amber-50",
  unpaid: "border-transparent bg-red-50 text-red-700 hover:bg-red-50",
};

const VIEW_ITEMS = [
  { value: "list", label: "ตามรายชื่อ" },
  { value: "byRoom", label: "จัดกลุ่มตามห้อง" },
];

export function OutstandingReportPanel() {
  useRequireRole(["admin", "finance", "teacher"]);

  const { profile } = useAuth();
  const { ctx } = useSemesterContext();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const gradeParam = searchParams.get("grade") ?? "all";
  const classroomParam = searchParams.get("classroom") ?? "all";
  const statusParam = parseOutstandingStatus(searchParams.get("status"));

  const variantParam = searchParams.get("variant") ?? "all";
  const variantValue: PriceTier | "all" = parsePriceTier(variantParam) ?? "all";

  const invoiceTypeParam = searchParams.get("invoiceType") ?? "all";

  const rawView = searchParams.get("view");
  const viewParam: "list" | "byRoom" = rawView === "byRoom" ? "byRoom" : "list";
  const rosterHref = `/reports/students?${rosterQueryFromOutstanding(searchParams.toString())}`;

  // "รวมรายคน" used to be a view of this report; the per-student report is the
  // same thing, so an old link to it lands there with the same filters.
  const legacyPerStudent = rawView === "perStudent";
  useEffect(() => {
    if (legacyPerStudent) router.replace(rosterHref);
  }, [legacyPerStudent, rosterHref, router]);

  const teacherProfileId = profile?.role === "teacher" ? profile.id : undefined;

  const { data: fetchedRows = [], isLoading: fetching } = useQuery({
    queryKey: [
      "outstanding-report",
      ctx?.semesterId,
      ctx?.academicYearId,
      gradeParam,
      classroomParam,
      statusParam,
      variantValue,
      invoiceTypeParam,
      teacherProfileId,
    ],
    queryFn: async () => {
      const data = await fetchOutstandingReport({
        semesterId: ctx!.semesterId,
        academicYearId: ctx!.academicYearId,
        gradeLevelId: gradeParam !== "all" ? gradeParam : undefined,
        classroomId: classroomParam !== "all" ? classroomParam : undefined,
        ...outstandingStatusQuery(statusParam),
        variant: variantValue,
        invoiceTypeId: invoiceTypeParam !== "all" ? invoiceTypeParam : undefined,
        teacherProfileId,
      });
      return [...data].sort((a, b) =>
        a.studentCode.localeCompare(b.studentCode, "th", { numeric: true }),
      );
    },
    // Not for an old ?view=perStudent link: it is being sent to the roster.
    enabled: !!ctx && !legacyPerStudent,
  });

  // An old per-student link shows the skeleton until it is sent to the roster.
  const rowsLoading = fetching || legacyPerStudent;
  const rows = owedInvoices(fetchedRows, statusParam);

  const { data: grades = [] } = useQuery({
    queryKey: ["grade-levels", ctx?.semesterId],
    queryFn: () => fetchGradeLevels(ctx!.semesterId),
    enabled: !!ctx,
  });

  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms", ctx?.semesterId],
    queryFn: () => fetchClassroomsBySemester(ctx!.semesterId),
    enabled: !!ctx,
  });

  const { data: invoiceTypes = [] } = useQuery({
    queryKey: ["invoice-types"],
    queryFn: fetchInvoiceTypes,
  });

  const params = {
    grade: gradeParam,
    classroom: classroomParam,
    status: statusParam,
    variant: variantValue,
    invoiceType: invoiceTypeParam,
    view: viewParam,
  };

  // A plain function: `params` is rebuilt every render, so a useCallback on it
  // never held, and the React compiler memoises this on its own.
  const pushParams = (next: Partial<typeof params>) => {
      const query = new URLSearchParams(window.location.search);
      const grade = next.grade ?? params.grade;
      const classroom = next.classroom ?? params.classroom;
      const status = next.status ?? params.status;
      const variant = next.variant ?? params.variant;
      const invoiceType = next.invoiceType ?? params.invoiceType;
      const view = next.view ?? params.view;

      if (grade !== "all") query.set("grade", grade);
      else query.delete("grade");
      if (classroom !== "all") query.set("classroom", classroom);
      else query.delete("classroom");
      // The default (still owed) needs no param; "all" has to be spelled out.
      if (status !== "outstanding") query.set("status", status);
      else query.delete("status");
      if (variant !== "all") query.set("variant", variant);
      else query.delete("variant");
      if (invoiceType !== "all") query.set("invoiceType", invoiceType);
      else query.delete("invoiceType");
      if (view !== "list") query.set("view", view);
      else query.delete("view");

      router.push(`${pathname}?${query.toString()}`);
  };

  const gradeItems = [
    { value: "all", label: "ทุกชั้น" },
    ...grades.map((g) => ({ value: g.id, label: g.name })),
  ];

  const classroomItems = [
    { value: "all", label: "ทุกห้อง" },
    ...classrooms
      .filter((c) => params.grade === "all" || c.grade_level_id === params.grade)
      .map((c) => ({ value: c.id, label: `${grades.find((g) => g.id === c.grade_level_id)?.name ?? ""}/${c.name}` })),
  ];

  const invoiceTypeItems = [
    { value: "all", label: "ทุกประเภทใบแจ้งหนี้" },
    ...invoiceTypes.map((t) => ({ value: t.id, label: t.name })),
  ];

  const groupedByRoom = (() => {
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.gradeClassroom;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    // Room labels ("ตอ./1", "ป.1/1") need school-level order, not Thai
    // alphabetical order — the latter buries อ. below ป. and ม.
    return [...groups.entries()].sort((a, b) => compareGradeLevelNames(a[0], b[0]));
  })();

  const listTotals = rows.reduce(
    (acc, r) => ({
      subtotal: acc.subtotal + r.subtotal,
      totalAmount: acc.totalAmount + r.totalAmount,
      paidAmount: acc.paidAmount + r.paidAmount,
      outstanding: acc.outstanding + r.outstanding,
    }),
    { subtotal: 0, totalAmount: 0, paidAmount: 0, outstanding: 0 },
  );

  // Where the same filters lead on the debtors report (all years, leavers
  // included). Price tier and invoice type have no field there.
  const debtorsHref = `/reports/debtors?${pickQuery(searchParams.toString(), ["year", "semester", "grade", "classroom"])}`;

  return (
    <>
      <AppHeader title="รายงานค้างชำระ" basePath="/reports/outstanding" />
      <style>{"@media print { @page { size: A4 landscape; margin: 10mm; } }"}</style>
      <main className="p-4 lg:p-6 print:p-0">
        <ReportLetterhead
          title="รายงานค้างชำระ"
          yearName={ctx?.academicYearName}
          semesterNumber={ctx?.semesterNumber}
        />
        <Card className="border-border shadow-sm print:border-none print:shadow-none">
        <CardContent className="space-y-4 print:p-0 print:text-xs">
          <div className="report-toolbar flex flex-wrap items-center gap-2">
            <Select
              value={params.grade}
              onValueChange={(v) => pushParams({ grade: v ?? "all", classroom: "all" })}
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
            <Select
              value={params.status}
              onValueChange={(v) => pushParams({ status: parseOutstandingStatus(v ?? null) })}
              items={OUTSTANDING_STATUS_ITEMS}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="สถานะ" />
              </SelectTrigger>
              <SelectContent>
                {OUTSTANDING_STATUS_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={params.variant}
              onValueChange={(v) => pushParams({ variant: (v ?? "all") as typeof params.variant })}
              items={REIMBURSABLE_ITEMS}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="ประเภท" />
              </SelectTrigger>
              <SelectContent>
                {REIMBURSABLE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={params.invoiceType}
              onValueChange={(v) => pushParams({ invoiceType: v ?? "all" })}
              items={invoiceTypeItems}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="ประเภทใบแจ้งหนี้" />
              </SelectTrigger>
              <SelectContent>
                {invoiceTypeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={viewParam}
              onValueChange={(v) => pushParams({ view: (v ?? "list") as typeof params.view })}
              items={VIEW_ITEMS}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="มุมมอง" />
              </SelectTrigger>
              <SelectContent>
                {VIEW_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ReportToolbar />
          </div>

          <p className="text-xs text-muted-foreground print:hidden">
            ยอดของภาคเรียนที่เลือกเท่านั้น
            {/* The debtors report is not offered to teachers (see
                teacher-routes.ts), so neither is the way to it. */}
            {profile?.role === "teacher" ? null : (
              <>
                {" · "}ยอดค้างสะสมทุกปี ดูที่{" "}
                <Link href={debtorsHref} className="underline hover:text-foreground">
                  ลูกหนี้รายห้อง →
                </Link>
              </>
            )}
            {" · "}
            <Link href={rosterHref} className="underline hover:text-foreground">
              ดูยอดรวมรายคน → รายบุคคล
            </Link>
          </p>

          {/* Mobile stacked cards */}
          {rowsLoading ? (
            <div className="sm:hidden h-40 animate-pulse rounded-lg bg-muted" />
          ) : rows.length === 0 ? (
            <p className="sm:hidden py-6 text-center text-sm text-muted-foreground">
              ไม่พบรายการค้างชำระ
            </p>
          ) : (
            <div className="sm:hidden space-y-2">
              {rows.map((row) => (
                <div key={row.invoiceId} className="rounded-lg border border-border px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{row.studentName}</p>
                        {row.priceTier !== "standard" ? (
                          <Badge className={priceTierBadgeClass(row.priceTier)}>
                            {priceTierLabel(row.priceTier)}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {row.studentCode} · {row.gradeClassroom}
                      </p>
                      {row.unpaidLinesLabel ? (
                        <p className={unpaidLinesClass(row.unpaidLinesLabel, "mt-0.5 text-xs")}>
                          ค้าง: {row.unpaidLinesLabel}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-semibold tabular-nums text-amber-700">
                        ค้าง {formatBaht(row.outstanding)}
                      </span>
                      <Badge variant="outline" className={STATUS_BADGE_CLASSES[row.status]}>{INVOICE_STATUS_LABELS[row.status]}</Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                    <span>ต้องชำระ <span className="tabular-nums text-foreground">{formatBaht(row.totalAmount)}</span></span>
                    <span>ชำระแล้ว <span className="tabular-nums text-foreground">{formatBaht(row.paidAmount)}</span></span>
                    {formatDiscount(row.discountType, row.discountValue) ? (
                      <span className="text-red-700">{formatDiscount(row.discountType, row.discountValue)}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                    <span>ออกใบ {formatThaiDate(row.issuedAt)}</span>
                    <span>จ่ายล่าสุด {row.lastPaidAt ? formatThaiDate(row.lastPaidAt) : "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Desktop table */}
          {viewParam === "byRoom" ? (
            rowsLoading ? (
              <div className="hidden sm:block">
                <TableSkeleton rows={8} />
              </div>
            ) : rows.length === 0 ? (
              <p className="hidden sm:block py-6 text-center text-sm text-muted-foreground">
                ไม่พบรายการค้างชำระ
              </p>
            ) : (
              <div className="hidden sm:block space-y-6">
                {groupedByRoom.map(([room, roomRows]) => {
                  const roomOutstanding = roomRows.reduce((s, r) => s + r.outstanding, 0);
                  const roomPaid = roomRows.reduce((s, r) => s + r.paidAmount, 0);
                  return (
                    <div key={room} className="report-room-group">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="font-semibold">{room}</h3>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          รวมยอดเก็บได้ {formatBaht(roomPaid)} · ค้างรวม {formatBaht(roomOutstanding)}
                        </span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">ลำดับ</TableHead>
                            <TableHead>รหัส</TableHead>
                            <TableHead>ชื่อ-นามสกุล</TableHead>
                            <TableHead className="text-right">ต้องชำระ</TableHead>
                            <TableHead className="text-right">ชำระแล้ว</TableHead>
                            <TableHead className="text-right">ค้าง</TableHead>
                            <TableHead>รายการที่ค้าง</TableHead>
                            <TableHead>ส่วนลด</TableHead>
                            <TableHead>สถานะ</TableHead>
                            <TableHead>วันที่ออกใบ</TableHead>
                            <TableHead>จ่ายล่าสุด</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {roomRows.map((row, index) => (
                            <TableRow key={row.invoiceId}>
                              <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                              <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                              <TableCell>{row.studentName}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatBaht(row.totalAmount)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatBaht(row.paidAmount)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{formatBaht(row.outstanding)}</TableCell>
                              <TableCell className={unpaidLinesClass(row.unpaidLinesLabel)}>
                                {row.unpaidLinesLabel}
                              </TableCell>
                              <TableCell className="text-red-700">
                                {formatDiscount(row.discountType, row.discountValue) ?? "—"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={STATUS_BADGE_CLASSES[row.status]}>{INVOICE_STATUS_LABELS[row.status]}</Badge>
                              </TableCell>
                              <TableCell>{formatThaiDate(row.issuedAt)}</TableCell>
                              <TableCell>{row.lastPaidAt ? formatThaiDate(row.lastPaidAt) : "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">ลำดับ</TableHead>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อ-นามสกุล</TableHead>
                  <TableHead>ชั้น/ห้อง</TableHead>
                  <TableHead className="text-right">ค่าใช้จ่าย</TableHead>
                  <TableHead className="text-right">ต้องชำระ</TableHead>
                  <TableHead className="text-right">ชำระแล้ว</TableHead>
                  <TableHead className="text-right">ค้าง</TableHead>
                  <TableHead>รายการที่ค้าง</TableHead>
                  <TableHead>ส่วนลด</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>วันที่ออกใบ</TableHead>
                  <TableHead>จ่ายล่าสุด</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsLoading ? (
                  <TableRow>
                    <TableCell colSpan={13} className="py-6 text-center text-muted-foreground">
                      กำลังโหลด...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="py-6 text-center text-muted-foreground">
                      ไม่พบรายการค้างชำระ
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, index) => (
                    <TableRow key={row.invoiceId}>
                      <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{row.studentName}</span>
                          {row.priceTier !== "standard" ? (
                            <Badge className={priceTierBadgeClass(row.priceTier)}>
                              {priceTierLabel(row.priceTier)}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{row.gradeClassroom}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(row.subtotal)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBaht(row.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBaht(row.paidAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatBaht(row.outstanding)}
                      </TableCell>
                      <TableCell className={unpaidLinesClass(row.unpaidLinesLabel)}>
                        {row.unpaidLinesLabel}
                      </TableCell>
                      <TableCell className="text-red-700">
                        {formatDiscount(row.discountType, row.discountValue) ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_BADGE_CLASSES[row.status]}>{INVOICE_STATUS_LABELS[row.status]}</Badge>
                      </TableCell>
                      <TableCell>{formatThaiDate(row.issuedAt)}</TableCell>
                      <TableCell>{row.lastPaidAt ? formatThaiDate(row.lastPaidAt) : "—"}</TableCell>
                    </TableRow>
                  ))
                )}
                {!rowsLoading && rows.length > 0 ? (
                  <TableRow className="border-t-2 font-semibold">
                    <TableCell colSpan={4}>รวม {rows.length} ใบ</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(listTotals.subtotal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(listTotals.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(listTotals.paidAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(listTotals.outstanding)}</TableCell>
                    <TableCell colSpan={5} />
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
        </Card>
      </main>
    </>
  );
}

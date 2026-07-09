"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { useRequireRole } from "@/components/providers/auth-provider";
import { useSemesterContext } from "@/hooks/use-semester-context";
import { fetchDailyRevenue } from "@/lib/queries/reports";
import { ReportToolbar } from "@/components/finance/report-toolbar";
import { ReportLetterhead } from "@/components/finance/report-letterhead";
import { Input } from "@/components/ui/input";
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
import { formatBaht, formatThaiDate } from "@/lib/format";

const METHOD_ITEMS = [
  { value: "all", label: "ทุกวิธี" },
  { value: "cash", label: "เงินสด" },
  { value: "transfer", label: "เงินโอน" },
];

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DailyRevenuePanel() {
  useRequireRole(["admin", "finance"]);

  const { ctx } = useSemesterContext();
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [method, setMethod] = useState<"all" | "cash" | "transfer">("all");
  const [openDate, setOpenDate] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["daily-revenue", ctx?.academicYearId, ctx?.semesterId, dateFrom, dateTo, method],
    queryFn: () =>
      fetchDailyRevenue({
        academicYearId: ctx!.academicYearId,
        semesterId: ctx!.semesterId,
        dateFrom,
        dateTo,
        method,
      }),
    enabled: !!ctx,
  });

  const summary = data?.summary ?? [];
  const receiptsByDate = data?.receiptsByDate ?? {};

  const totals = summary.reduce(
    (acc, r) => ({
      receiptCount: acc.receiptCount + r.receiptCount,
      cashTotal: acc.cashTotal + r.cashTotal,
      transferTotal: acc.transferTotal + r.transferTotal,
      total: acc.total + r.total,
    }),
    { receiptCount: 0, cashTotal: 0, transferTotal: 0, total: 0 },
  );

  return (
    <>
      <AppHeader title="รายรับรายวัน" basePath="/reports/daily" />
      <main className="p-4 lg:p-6">
        <ReportLetterhead
          title="รายงานรายรับรายวัน"
          yearName={ctx?.academicYearName}
          semesterNumber={ctx?.semesterNumber}
          subtitle={`ช่วงวันที่ ${dateFrom} ถึง ${dateTo}`}
        />
        <div className="space-y-4">
          <div className="report-toolbar flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground">ตั้งแต่</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">ถึง</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
            </div>
            <Select value={method} onValueChange={(v) => setMethod((v ?? "all") as typeof method)} items={METHOD_ITEMS}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="วิธีจ่าย" />
              </SelectTrigger>
              <SelectContent>
                {METHOD_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <ReportToolbar />
            </div>
          </div>

          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted" />
          ) : summary.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีข้อมูลในช่วงที่เลือก</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>วันที่</TableHead>
                  <TableHead className="text-right">จำนวนใบเสร็จ</TableHead>
                  <TableHead className="text-right">เงินสด</TableHead>
                  <TableHead className="text-right">เงินโอน</TableHead>
                  <TableHead className="text-right">รวม</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((row) => (
                  <Fragment key={row.dateKey}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setOpenDate(openDate === row.dateKey ? null : row.dateKey)}
                    >
                      <TableCell className="font-medium">
                        {formatThaiDate(`${row.dateKey}T00:00:00+07:00`)}
                        {row.voidedCount > 0 ? (
                          <Badge variant="outline" className="ml-2 text-xs">
                            ยกเลิก {row.voidedCount}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.receiptCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(row.cashTotal)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBaht(row.transferTotal)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatBaht(row.total)}</TableCell>
                    </TableRow>
                    {openDate === row.dateKey
                      ? (receiptsByDate[row.dateKey] ?? []).map((rec) => (
                          <TableRow key={rec.paymentId} className="bg-muted/40 text-sm">
                            <TableCell className="pl-8">
                              {rec.timeLabel} · {rec.receiptNumber}
                              {rec.status === "voided" ? (
                                <Badge variant="outline" className="ml-2 text-xs text-red-600">ยกเลิก</Badge>
                              ) : null}
                            </TableCell>
                            <TableCell colSpan={2}>
                              {rec.studentName} ({rec.studentCode})
                            </TableCell>
                            <TableCell className="text-right">
                              {rec.paymentMethod === "cash" ? "เงินสด" : "เงินโอน"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatBaht(rec.amount)}</TableCell>
                          </TableRow>
                        ))
                      : null}
                  </Fragment>
                ))}
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>รวมทั้งช่วง</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.receiptCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBaht(totals.cashTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBaht(totals.transferTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBaht(totals.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </>
  );
}

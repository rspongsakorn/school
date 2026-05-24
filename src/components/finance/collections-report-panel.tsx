"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht } from "@/lib/format";
import type { CollectionsReportRow } from "@/lib/data/reports";

type CollectionsReportPanelProps = {
  rows: CollectionsReportRow[];
};

export function CollectionsReportPanel({ rows }: CollectionsReportPanelProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ชั้น</TableHead>
          <TableHead className="text-right">จำนวนนักเรียน</TableHead>
          <TableHead className="text-right">ยอดที่ต้องเก็บ</TableHead>
          <TableHead className="text-right">ยอดที่เก็บได้</TableHead>
          <TableHead className="text-right">อัตรา (%)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
              ไม่มีข้อมูล
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.gradeName}>
              <TableCell className="font-medium">{row.gradeName}</TableCell>
              <TableCell className="text-right tabular-nums">{row.studentCount}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBaht(row.totalDue)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatBaht(row.totalPaid)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.ratePercent}%</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

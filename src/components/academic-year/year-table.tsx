"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatThaiDate } from "@/lib/format";
import type { AcademicYearRow } from "@/lib/data/academic-years";

type YearTableProps = {
  years: AcademicYearRow[];
  onEdit: (year: AcademicYearRow) => void;
};

export function YearTable({ years, onEdit }: YearTableProps) {
  if (years.length === 0) {
    return (
      <p className="px-6 pb-6 text-sm text-muted-foreground">
        ยังไม่มีปีการศึกษาในระบบ กดปุ่ม "เพิ่มปีการศึกษา" เพื่อเริ่มต้น
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ชื่อปีการศึกษา</TableHead>
          <TableHead>ช่วงวันที่</TableHead>
          <TableHead>สถานะ</TableHead>
          <TableHead className="w-[120px] text-right">การจัดการ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {years.map((year) => (
          <TableRow key={year.id}>
            <TableCell className="font-medium">{year.name}</TableCell>
            <TableCell>
              {formatThaiDate(year.start_date)} - {formatThaiDate(year.end_date)}
            </TableCell>
            <TableCell>
              {year.is_active ? (
                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                  ใช้งานอยู่
                </Badge>
              ) : (
                <Badge variant="outline">ไม่ใช้งาน</Badge>
              )}
            </TableCell>
            <TableCell className="text-right">
              <Button size="sm" variant="outline" onClick={() => onEdit(year)}>
                แก้ไข
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

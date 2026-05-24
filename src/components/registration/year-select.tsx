"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AcademicYearOption } from "@/lib/enrollment/year-params";

type YearSelectProps = {
  years: AcademicYearOption[];
  selectedYearId: string;
  basePath: string;
};

export function YearSelect({ years, selectedYearId, basePath }: YearSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(yearId: string | null) {
    if (!yearId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", yearId);
    router.push(`${basePath}?${params.toString()}`);
  }

  if (years.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">ยังไม่มีปีการศึกษา — กรุณาเพิ่มที่หน้าปีการศึกษา</p>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <Label htmlFor="year-select" className="shrink-0 text-sm font-medium">
        ปีการศึกษา
      </Label>
      <Select value={selectedYearId} onValueChange={handleChange}>
        <SelectTrigger id="year-select" className="w-full sm:w-[200px]">
          <SelectValue placeholder="เลือกปีการศึกษา" />
        </SelectTrigger>
        <SelectContent>
          {years.map((year) => (
            <SelectItem key={year.id} value={year.id}>
              {year.name}
              {year.is_active ? " (ปัจจุบัน)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

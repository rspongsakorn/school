"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BIRTH_MONTH_OPTIONS,
  birthYearOptions,
  buildBirthDateIso,
  daysInMonth,
  parseBirthDateParts,
} from "@/lib/students/dates";

type BirthDatePartsState = {
  year: string;
  month: string;
  day: string;
};

type BirthDatePickerProps = {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  "aria-invalid"?: boolean;
};

function partsFromValue(value: string): BirthDatePartsState {
  const parsed = parseBirthDateParts(value);
  if (!parsed) return { year: "", month: "", day: "" };
  return {
    year: String(parsed.year),
    month: String(parsed.month),
    day: String(parsed.day),
  };
}

export function BirthDatePicker({
  id,
  value,
  onChange,
  disabled,
  "aria-invalid": ariaInvalid,
}: BirthDatePickerProps) {
  const [parts, setParts] = useState<BirthDatePartsState>(() => partsFromValue(value));

  // Sync only when parent has a complete date (avoid clearing partial year/month/day picks)
  useEffect(() => {
    const parsed = parseBirthDateParts(value);
    if (parsed) {
      setParts({
        year: String(parsed.year),
        month: String(parsed.month),
        day: String(parsed.day),
      });
    }
  }, [value]);

  const yearOptions = useMemo(() => birthYearOptions(), []);

  const dayOptions = useMemo(() => {
    if (!parts.year || !parts.month) return [];
    const maxDay = daysInMonth(Number(parts.year), Number(parts.month));
    return Array.from({ length: maxDay }, (_, index) => {
      const d = String(index + 1);
      return { value: d, label: d };
    });
  }, [parts.year, parts.month]);

  function updatePart(next: Partial<BirthDatePartsState>) {
    const merged = { ...parts, ...next };
    setParts(merged);
    onChange(buildBirthDateIso(merged));
  }

  const canPickDay = Boolean(parts.year && parts.month);

  return (
    <div
      id={id}
      className="grid grid-cols-3 gap-2"
      aria-invalid={ariaInvalid}
    >
      <Select
        value={parts.year || undefined}
        onValueChange={(v) => v && updatePart({ year: v, day: "" })}
        disabled={disabled}
        items={yearOptions}
      >
        <SelectTrigger className="w-full" aria-label="ปี พ.ศ.">
          <SelectValue placeholder="ปี (พ.ศ.)" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {yearOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={parts.month || undefined}
        onValueChange={(v) => v && updatePart({ month: v, day: "" })}
        disabled={disabled}
        items={BIRTH_MONTH_OPTIONS}
      >
        <SelectTrigger className="w-full" aria-label="เดือน">
          <SelectValue placeholder="เดือน" />
        </SelectTrigger>
        <SelectContent>
          {BIRTH_MONTH_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={parts.day || undefined}
        onValueChange={(v) => v && updatePart({ day: v })}
        disabled={disabled || !canPickDay}
        items={dayOptions}
      >
        <SelectTrigger className="w-full" aria-label="วัน">
          <SelectValue placeholder="วัน" />
        </SelectTrigger>
        <SelectContent>
          {dayOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

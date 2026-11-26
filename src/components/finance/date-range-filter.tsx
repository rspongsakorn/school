"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DateFilterInput } from "@/components/finance/date-filter-input";
import { fetchLatestPaymentDate, fetchSemesterDates } from "@/lib/queries/reports";
import { bangkokDateKey } from "@/lib/reports/date";
import { formatThaiRange, presetRange, type DatePreset } from "@/lib/reports/date-range";

/** Today's Bangkok calendar day: the default range of the date reports. */
export function todayKey(): string {
  return bangkokDateKey(new Date());
}

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "วันนี้" },
  { value: "month", label: "เดือนนี้" },
  { value: "semester", label: "ภาคเรียนนี้" },
];

/**
 * The two date fields of a date report, the quick ranges beside them, and the
 * chosen range written out in Thai (the fields themselves show the browser's
 * own format, which a native date input cannot be made to change).
 */
export function DateRangeFilter({
  from,
  to,
  semesterId,
  onChange,
}: {
  from: string;
  to: string;
  semesterId?: string;
  onChange: (range: { from?: string; to?: string }) => void;
}) {
  const { data: semester } = useQuery({
    queryKey: ["semester-dates", semesterId],
    queryFn: () => fetchSemesterDates(semesterId!),
    enabled: !!semesterId,
    staleTime: 60_000,
  });
  const today = todayKey();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs text-muted-foreground">ตั้งแต่</label>
          <DateFilterInput value={from} onCommit={(v) => onChange({ from: v })} className="w-[160px]" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">ถึง</label>
          <DateFilterInput value={to} onCommit={(v) => onChange({ to: v })} className="w-[160px]" />
        </div>
        <div className="flex gap-1 print:hidden">
          {PRESETS.map((p) => {
            const range = presetRange(p.value, today, semester);
            // A semester with no dates on file has no range to offer.
            if (!range) return null;
            const active = range.from === from && range.to === to;
            return (
              <Button
                key={p.value}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                onClick={() => onChange(range)}
              >
                {p.label}
              </Button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{formatThaiRange(from, to)}</p>
    </div>
  );
}

/**
 * What an empty date report says: that this range is empty, and the day of
 * the latest receipt with a button to go there. Says only the first part when
 * the year has no receipts at all.
 */
export function EmptyRangeHint({
  academicYearId,
  message,
  onJump,
}: {
  academicYearId?: string;
  message: string;
  onJump: (day: string) => void;
}) {
  const { data: latest } = useQuery({
    queryKey: ["latest-payment-date", academicYearId],
    queryFn: () => fetchLatestPaymentDate(academicYearId!),
    enabled: !!academicYearId,
  });

  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
      <p>{message}</p>
      {latest ? (
        <p className="flex flex-wrap items-center justify-center gap-2">
          ใบเสร็จล่าสุดวันที่ {formatThaiRange(latest, latest)}
          <Button type="button" size="sm" variant="outline" onClick={() => onJump(latest)}>
            ดูวันนั้น
          </Button>
        </p>
      ) : null}
    </div>
  );
}

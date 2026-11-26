"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { formatBaht } from "@/lib/format";
import type { PayableLine } from "@/lib/finance/line-payment";

export type LineDiscountDraft = { value: string; unit: "fixed" | "percent" };

export const LEGACY_INVOICE_NOTE = "ใบนี้ชำระบางส่วนก่อนมีการเลือกรายการ";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Baht off one line for a discount being typed; capped at the line amount. */
export function draftDiscountAmount(lineAmount: number, draft?: LineDiscountDraft): number {
  if (!draft) return 0;
  const v = Number.parseFloat(draft.value);
  if (!Number.isFinite(v) || v <= 0) return 0;
  const amt = draft.unit === "percent" ? (lineAmount * v) / 100 : v;
  return Math.min(round2(amt), lineAmount);
}

/** What the ticked lines come to after their discounts. */
export function pickerTotal(
  lines: PayableLine[],
  selected: Set<string>,
  discounts: Record<string, LineDiscountDraft>,
): number {
  return round2(
    lines
      .filter((l) => selected.has(l.id) && !l.isPaid)
      .reduce((sum, l) => sum + l.amount - draftDiscountAmount(l.amount, discounts[l.id]), 0),
  );
}

/** Lines still owed, all ticked — the default when an invoice is opened. */
export function defaultSelection(lines: PayableLine[]): Set<string> {
  return new Set(lines.filter((l) => !l.isPaid).map((l) => l.id));
}

type Props = {
  lines: PayableLine[];
  /** Paid by ticking lines. False = legacy invoice, amount entry. */
  tracked: boolean;
  /** This invoice is the one being paid: show ticks and discount inputs. */
  active: boolean;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  discounts: Record<string, LineDiscountDraft>;
  onDiscountsChange: (next: Record<string, LineDiscountDraft>) => void;
  /** Discounts are only allowed before anything has been paid on the invoice. */
  discountsEnabled: boolean;
  /** Empty cells appended to each row, to match the host table's columns. */
  extraCells?: number;
};

/**
 * The invoice's lines as table rows under the invoice row. On a tracked
 * invoice only owed lines are listed, each with a tick box; a line is paid in
 * full or not at all.
 */
export function InvoiceLinePicker({
  lines,
  tracked,
  active,
  selected,
  onSelectedChange,
  discounts,
  onDiscountsChange,
  discountsEnabled,
  extraCells = 0,
}: Props) {
  const shown = tracked ? lines.filter((l) => !l.isPaid) : lines;

  function toggle(lineId: string) {
    const next = new Set(selected);
    if (next.has(lineId)) {
      next.delete(lineId);
      // A discount only applies to a line being paid.
      if (discounts[lineId]) {
        const rest = { ...discounts };
        delete rest[lineId];
        onDiscountsChange(rest);
      }
    } else {
      next.add(lineId);
    }
    onSelectedChange(next);
  }

  return (
    <>
      {shown.map((line) => {
        const ticked = tracked && selected.has(line.id);
        const canDiscount = active && discountsEnabled && (!tracked || ticked);
        const d = discounts[line.id] ?? { value: "", unit: "fixed" as const };
        const resolved = canDiscount ? draftDiscountAmount(line.amount, d) : 0;
        return (
          <TableRow key={line.id} className="border-0">
            <TableCell className="py-0.5 pl-5 text-xs break-words text-muted-foreground">
              {active && tracked ? (
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-3.5 shrink-0 accent-primary"
                    checked={ticked}
                    onChange={() => toggle(line.id)}
                    aria-label={`ชำระ ${line.description}`}
                  />
                  <span className={ticked ? "text-foreground" : undefined}>{line.description}</span>
                </label>
              ) : (
                <>· {line.description}</>
              )}
            </TableCell>
            <TableCell className="py-0.5 text-right text-xs tabular-nums text-muted-foreground">
              {active ? (
                <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                  {resolved > 0 ? (
                    <span className="shrink-0 text-[10px] text-green-700">−{formatBaht(resolved)}</span>
                  ) : null}
                  <Input
                    value={canDiscount ? d.value : ""}
                    disabled={!canDiscount}
                    onChange={(e) =>
                      onDiscountsChange({
                        ...discounts,
                        [line.id]: { value: e.target.value, unit: d.unit },
                      })
                    }
                    placeholder="ส่วนลด"
                    className="h-6 w-24 shrink-0 text-right text-xs"
                  />
                  <button
                    type="button"
                    disabled={!canDiscount}
                    className="w-6 shrink-0 text-[10px] text-primary hover:underline disabled:opacity-50"
                    onClick={() =>
                      onDiscountsChange({
                        ...discounts,
                        [line.id]: { value: d.value, unit: d.unit === "fixed" ? "percent" : "fixed" },
                      })
                    }
                  >
                    {d.unit === "fixed" ? "บาท" : "%"}
                  </button>
                  <span className="w-16 shrink-0 text-right tabular-nums">{formatBaht(line.amount)}</span>
                </div>
              ) : (
                formatBaht(line.amount)
              )}
            </TableCell>
            {Array.from({ length: extraCells }, (_, i) => (
              <TableCell key={i} />
            ))}
          </TableRow>
        );
      })}
    </>
  );
}

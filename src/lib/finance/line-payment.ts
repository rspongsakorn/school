/**
 * Pay by line: a payment settles whole invoice lines. A line is either fully
 * paid or owed — there is no partial line payment.
 *
 * Line states come from the `invoice_line_states` RPC. An invoice is
 * "tracked" when every payment on it recorded its lines; a "legacy" invoice
 * was partly paid before that, so which lines are owed is unknown and it keeps
 * amount entry.
 */

export type PayableLine = { id: string; description: string; amount: number; isPaid: boolean };

export type InvoiceLineStates = { tracked: boolean; lines: PayableLine[] };

export type LineStateRow = {
  invoice_id: string;
  invoice_line_id: string;
  description: string;
  amount: number | string;
  is_paid: boolean;
  invoice_tracked: boolean;
};

export const LEGACY_OUTSTANDING_LABEL = "ไม่ระบุ (ชำระก่อนระบบใหม่)";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Groups `invoice_line_states` rows by invoice. */
export function groupLineStates(rows: LineStateRow[]): Map<string, InvoiceLineStates> {
  const byInvoice = new Map<string, InvoiceLineStates>();
  for (const row of rows) {
    let entry = byInvoice.get(row.invoice_id);
    if (!entry) {
      entry = { tracked: true, lines: [] };
      byInvoice.set(row.invoice_id, entry);
    }
    if (!row.invoice_tracked) entry.tracked = false;
    // A paged read can hand back the same row twice; list each line once.
    if (entry.lines.some((l) => l.id === row.invoice_line_id)) continue;
    entry.lines.push({
      id: row.invoice_line_id,
      description: row.description,
      amount: Number(row.amount),
      isPaid: row.is_paid,
    });
  }
  return byInvoice;
}

export type LineSelectionResult =
  | { ok: true; amount: number; allocations: { invoiceLineId: string; amount: number }[] }
  | { ok: false; error: string };

/**
 * What a payment of the selected lines comes to, after the discounts given on
 * them (baht, already resolved). Mirrors the checks `record_payment` makes.
 */
export function resolveLineSelection(input: {
  lines: PayableLine[];
  selectedLineIds: string[];
  discountByLineId: Map<string, number>;
}): LineSelectionResult {
  const selected = [...new Set(input.selectedLineIds)];
  if (selected.length === 0) {
    return { ok: false, error: "เลือกรายการที่ชำระอย่างน้อย 1 รายการ" };
  }

  const lineById = new Map(input.lines.map((l) => [l.id, l]));
  for (const id of selected) {
    const line = lineById.get(id);
    if (!line) return { ok: false, error: "รายการไม่อยู่ในใบแจ้งนี้" };
    if (line.isPaid) return { ok: false, error: "รายการนี้ชำระแล้ว" };
  }

  for (const [lineId, discount] of input.discountByLineId) {
    if (!selected.includes(lineId)) {
      return { ok: false, error: "ให้ส่วนลดได้เฉพาะรายการที่เลือก" };
    }
    if (discount > lineById.get(lineId)!.amount) {
      return { ok: false, error: "ส่วนลดเกินยอดรายการ" };
    }
  }

  const allocations = selected.map((id) => ({
    invoiceLineId: id,
    amount: round2(lineById.get(id)!.amount - (input.discountByLineId.get(id) ?? 0)),
  }));
  const amount = round2(allocations.reduce((sum, a) => sum + a.amount, 0));
  return { ok: true, amount, allocations };
}

/** The outstanding report's "รายการที่ค้าง" cell. */
export function outstandingLinesLabel(input: {
  status: "unpaid" | "partial" | "paid";
  tracked: boolean;
  unpaidLineNames: string[];
}): string {
  if (input.status !== "partial") return "";
  if (!input.tracked) return LEGACY_OUTSTANDING_LABEL;
  return input.unpaidLineNames.join(", ");
}

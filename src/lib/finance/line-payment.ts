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

const RELOAD_HINT = "กรุณาเลือกนักเรียนใหม่เพื่อโหลดยอดล่าสุด";

/**
 * Thai message for a `record_payment` failure. The RPC raises English
 * messages; the ones a cashier can act on get their own wording, so a line
 * paid a moment ago by someone else doesn't look like a broken save.
 */
export function recordPaymentErrorMessage(rpcMessage: string | undefined): string {
  switch (rpcMessage) {
    case "line not payable":
      return `มีรายการที่ชำระไปแล้ว ${RELOAD_HINT}`;
    case "p_new_paid must equal current paid_amount + p_amount":
    case "payment would overpay the invoice":
      return `มีการชำระใบแจ้งนี้เข้ามาก่อนแล้ว ${RELOAD_HINT}`;
    case "amount does not match selected lines":
      return "ยอดเงินไม่ตรงกับรายการที่เลือก";
    case "discount on an unselected line":
      return "ให้ส่วนลดได้เฉพาะรายการที่เลือก";
    case "line selection required for this invoice":
      return "กรุณาเลือกรายการที่ชำระ";
    case "this invoice does not take a line selection":
      return "ใบแจ้งนี้เลือกรายการไม่ได้";
    default:
      return "ไม่สามารถบันทึกการชำระได้";
  }
}

/**
 * Paid lines as stored in the receipt snapshot: billed amounts, matching the
 * printed receipt (discounts are recorded on their own).
 */
export function paidLinesForSnapshot(
  lines: PayableLine[],
  lineIds: string[],
): { invoiceLineId: string; description: string; amount: number }[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  return lineIds.map((id) => ({
    invoiceLineId: id,
    description: byId.get(id)?.description ?? "",
    amount: byId.get(id)?.amount ?? 0,
  }));
}

/**
 * An invoice-level discount (write-off) is spread over every line, which
 * would contradict lines already settled by line. Refuse it then.
 */
export function invoiceDiscountBlockedReason(states: InvoiceLineStates | undefined): string | null {
  if (!states?.tracked) return null;
  return states.lines.some((l) => l.isPaid && l.amount > 0)
    ? "ใบแจ้งนี้ชำระแบบเลือกรายการไปแล้ว ให้ส่วนลดทั้งใบไม่ได้"
    : null;
}

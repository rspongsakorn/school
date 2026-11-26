/**
 * The status filter of the outstanding report.
 *
 * "outstanding" — every invoice still owed, unpaid or part-paid — is the
 * default: a report called ค้างชำระ that opens on paid invoices buries what
 * it is for. The three single statuses keep their old URL values so existing
 * bookmarks still mean what they meant; "all" has to be asked for.
 */
export type OutstandingStatusFilter = "outstanding" | "unpaid" | "partial" | "paid" | "all";

export const OUTSTANDING_STATUS_ITEMS: { value: OutstandingStatusFilter; label: string }[] = [
  { value: "outstanding", label: "ยังค้างชำระ" },
  { value: "unpaid", label: "ยังไม่ชำระ" },
  { value: "partial", label: "ชำระบางส่วน" },
  { value: "paid", label: "ชำระแล้ว" },
  { value: "all", label: "ทุกสถานะ" },
];

export function parseOutstandingStatus(raw: string | null): OutstandingStatusFilter {
  return raw === "unpaid" || raw === "partial" || raw === "paid" || raw === "all"
    ? raw
    : "outstanding";
}

/** The arguments fetchOutstandingReport takes for this filter. */
export function outstandingStatusQuery(filter: OutstandingStatusFilter): {
  status: "unpaid" | "partial" | "paid" | "all";
  includeAllStatuses: boolean;
} {
  if (filter === "outstanding") return { status: "all", includeAllStatuses: false };
  return { status: filter, includeAllStatuses: true };
}

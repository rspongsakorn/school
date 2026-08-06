/**
 * Price tier — which of the three ค่าเทอม prices applies to a student/invoice.
 *
 * - `standard`      เบิกไม่ได้
 * - `reimbursable`  เบิกได้ (ราชการ)
 * - `private`       เอกชน — private-school teachers who can claim reimbursement
 */
export type PriceTier = "standard" | "reimbursable" | "private";

export const PRICE_TIERS: PriceTier[] = ["standard", "reimbursable", "private"];

const LABELS: Record<PriceTier, string> = {
  standard: "เบิกไม่ได้",
  reimbursable: "เบิกได้",
  private: "เอกชน",
};

export function priceTierLabel(tier: PriceTier): string {
  return LABELS[tier];
}

const BADGE_CLASSES: Record<PriceTier, string> = {
  standard: "bg-muted text-muted-foreground hover:bg-muted",
  reimbursable: "bg-sky-50 text-sky-700 hover:bg-sky-50",
  private: "bg-violet-50 text-violet-700 hover:bg-violet-50",
};

/** Tailwind classes for the tier badge, shared by the student and invoice lists. */
export function priceTierBadgeClass(tier: PriceTier): string {
  return BADGE_CLASSES[tier];
}

export function parsePriceTier(value: string | null | undefined): PriceTier | null {
  return PRICE_TIERS.includes(value as PriceTier) ? (value as PriceTier) : null;
}

/**
 * Parses the Thai wording used in CSV/XLSX imports. An empty cell means
 * เบิกไม่ได้, matching the previous behaviour of the boolean column.
 */
export function parsePriceTierLabel(label: string): PriceTier | null {
  const value = label.trim();
  if (!value) return "standard";
  const tier = PRICE_TIERS.find((t) => LABELS[t] === value);
  return tier ?? null;
}

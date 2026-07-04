/**
 * READ-ONLY inspection: accident-insurance fee item on the tuition invoice type.
 * Uses the Supabase service-role client over HTTPS.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  const src = existsSync(path) ? path : resolve(root, "env.local");
  const env = {};
  for (const line of readFileSync(src, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnvLocal();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// 1. All invoice types
const { data: invoiceTypes, error: itErr } = await supabase
  .from("invoice_types")
  .select("id, code, name, is_active");
if (itErr) throw itErr;
console.log("=== invoice_types ===");
console.table(invoiceTypes);

// 2. All fee items (look for accident insurance)
const { data: feeItems, error: fiErr } = await supabase
  .from("fee_items")
  .select("id, name, is_tuition, is_active, invoice_type_id");
if (fiErr) throw fiErr;
console.log("\n=== fee_items ===");
console.table(feeItems);

// Identify the accident-insurance fee item(s)
const insuranceItems = (feeItems ?? []).filter((f) => f.name.includes("ประกันอุบัติเหตุ"));
console.log("\n=== Matched accident-insurance fee_items ===");
console.table(insuranceItems);

const insuranceIds = insuranceItems.map((f) => f.id);

if (insuranceIds.length === 0) {
  console.log("\nNo accident-insurance fee item found. Stopping.");
  process.exit(0);
}

// 3. fee_rates that reference the insurance item
const { data: rates, error: frErr } = await supabase
  .from("fee_rates")
  .select("id, academic_year_id, semester_id, grade_level_id, fee_item_id, amount, invoice_type_id")
  .in("fee_item_id", insuranceIds);
if (frErr) throw frErr;
console.log(`\n=== fee_rates referencing insurance item: ${rates?.length ?? 0} ===`);
console.table(rates);

// 4. invoice_lines that reference the insurance item
const { data: lines, error: ilErr } = await supabase
  .from("invoice_lines")
  .select("id, invoice_id, fee_item_id, description, amount")
  .in("fee_item_id", insuranceIds);
if (ilErr) throw ilErr;
console.log(`\n=== invoice_lines referencing insurance item: ${lines?.length ?? 0} ===`);
const totalLineAmount = (lines ?? []).reduce((s, l) => s + Number(l.amount), 0);
console.log(`Total amount across those lines: ${totalLineAmount}`);

const invoiceIds = [...new Set((lines ?? []).map((l) => l.invoice_id))];
console.log(`Distinct invoices affected: ${invoiceIds.length}`);

// 5. Of those invoices, how many have payments (paid_amount > 0)?
if (invoiceIds.length > 0) {
  const { data: invoices, error: invErr } = await supabase
    .from("student_invoices")
    .select("id, invoice_name, subtotal, discount_type, discount_value, total_amount, paid_amount, status, invoice_type_id")
    .in("id", invoiceIds);
  if (invErr) throw invErr;
  const paid = (invoices ?? []).filter((i) => Number(i.paid_amount) > 0);
  console.log(`\n=== Affected invoices with paid_amount > 0: ${paid.length} ===`);
  console.table(
    paid.map((i) => ({
      id: i.id,
      name: i.invoice_name,
      subtotal: i.subtotal,
      total: i.total_amount,
      paid: i.paid_amount,
      status: i.status,
    })),
  );

  // Group affected invoices by their invoice_type
  const byType = {};
  for (const i of invoices ?? []) {
    byType[i.invoice_type_id] = (byType[i.invoice_type_id] ?? 0) + 1;
  }
  console.log("\n=== Affected invoices grouped by invoice_type_id ===");
  console.table(
    Object.entries(byType).map(([tid, n]) => ({
      invoice_type_id: tid,
      name: invoiceTypes.find((t) => t.id === tid)?.name ?? "(unknown)",
      invoices: n,
    })),
  );
}

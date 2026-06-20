/**
 * READ-ONLY inspection of payment data before a one-time clear.
 * Uses the Supabase service-role client over HTTPS (avoids direct PG/IPv6 issues).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) {
    console.error("Missing .env.local");
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
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

async function count(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count;
}

console.log("=== Row counts ===");
for (const t of ["payments", "payment_allocations", "receipts", "payment_voids"]) {
  console.log(`${t}: ${await count(t)}`);
}
const { count: invWithPay } = await supabase
  .from("student_invoices")
  .select("*", { count: "exact", head: true })
  .gt("paid_amount", 0);
console.log(`student_invoices with paid_amount > 0: ${invWithPay}`);

const { data: payments, error } = await supabase
  .from("payments")
  .select("receipt_number, amount, status, paid_at, students!inner(student_code, first_name, last_name)")
  .order("receipt_number", { ascending: true });
if (error) throw error;

console.log("\n=== Existing payments/receipts ===");
console.table(
  (payments ?? []).map((p) => ({
    receipt: p.receipt_number,
    code: p.students.student_code,
    name: `${p.students.first_name} ${p.students.last_name}`,
    amount: p.amount,
    status: p.status,
    paid_at: p.paid_at,
  })),
);

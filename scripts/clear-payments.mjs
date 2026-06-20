/**
 * ONE-TIME: clear all payment data so receipt numbers restart at 00001.
 * Deletes in FK-safe order and resets affected invoices. Service-role over HTTPS.
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

const ALL = "00000000-0000-0000-0000-000000000000"; // sentinel; delete where id <> sentinel = all rows

async function del(table) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .neq("id", ALL);
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`deleted ${count} from ${table}`);
}

// FK-safe order: payment_voids and receipts and allocations reference payments (ON DELETE RESTRICT).
await del("payment_voids");
await del("receipts");
await del("payment_allocations");
await del("payments");

// Reset invoices that were marked paid by the now-deleted payments.
const { error: invErr, count: invCount } = await supabase
  .from("student_invoices")
  .update({ paid_amount: 0, status: "unpaid" }, { count: "exact" })
  .gt("paid_amount", 0);
if (invErr) throw new Error(`student_invoices: ${invErr.message}`);
console.log(`reset ${invCount} student_invoices to unpaid`);

// Verify
async function count(table) {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return count;
}
console.log("\n=== After ===");
for (const t of ["payments", "payment_allocations", "receipts", "payment_voids"]) {
  console.log(`${t}: ${await count(t)}`);
}
const { count: invLeft } = await supabase
  .from("student_invoices")
  .select("*", { count: "exact", head: true })
  .gt("paid_amount", 0);
console.log(`student_invoices with paid_amount > 0: ${invLeft}`);

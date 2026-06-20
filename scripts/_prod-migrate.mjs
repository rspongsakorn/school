/**
 * TEMPORARY prod migrate helper for the 20260611* migration group.
 * Connects via the IPv4 session pooler (direct host is IPv6-only here).
 *
 *   node scripts/_prod-migrate.mjs --env .env.prod --check    (read-only preflight)
 *   node scripts/_prod-migrate.mjs --env .env.prod --backup   (dump at-risk data)
 *   node scripts/_prod-migrate.mjs --env .env.prod --apply    (apply pending + seed)
 */
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const ENV_FILE = (() => {
  const i = process.argv.indexOf("--env");
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : ".env.prod";
})();
const REGIONS = ["ap-southeast-1","ap-northeast-1","ap-southeast-2","ap-northeast-2","ap-south-1","us-east-1","us-east-2","us-west-1","eu-central-1","eu-west-1","eu-west-2","sa-east-1"];

function loadEnv() {
  const path = resolve(root, ENV_FILE);
  if (!existsSync(path)) { console.error(`Missing ${ENV_FILE}`); process.exit(1); }
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("="); if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).replace(/\r$/, "").trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}
function ref(url) { return url.replace(/^https?:\/\//, "").replace(/\.supabase\.co\/?$/, ""); }

async function connect(env) {
  const r = ref(env.NEXT_PUBLIC_SUPABASE_URL || "");
  const password = env.SUPABASE_DB_PASSWORD || "";
  for (const prefix of ["aws-1", "aws-0"]) {
    for (const region of REGIONS) {
      const host = `${prefix}-${region}.pooler.supabase.com`;
      const client = new pg.Client({ host, port: 5432, user: `postgres.${r}`, password, database: "postgres", ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
      try {
        await client.connect();
        await client.query("SELECT 1");
        console.log(`Connected via ${host}\n`);
        return client;
      } catch (e) {
        await client.end().catch(() => {});
        if (/password authentication failed/i.test(e.message)) throw new Error(`${host}: password rejected`);
      }
    }
  }
  throw new Error("No pooler region accepted credentials.");
}

async function check(c) {
  const q = async (label, sql) => { const { rows } = await c.query(sql); console.log(`  ${String(rows[0].v).padEnd(8)} ${label}`); return rows[0].v; };
  console.log("-- preflight --");
  const has01 = await q("receipt_types code '01' exists", "SELECT (EXISTS(SELECT 1 FROM public.receipt_types WHERE code='01'))::text AS v");
  await q("fee_items rows", "SELECT count(*)::text AS v FROM public.fee_items");
  await q("student_invoices rows", "SELECT count(*)::text AS v FROM public.student_invoices");
  await q("student_invoices.invoice_name present", "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='student_invoices' AND column_name='invoice_name')::text AS v");
  await q("invoice_types exists (should be false pre-migrate)", "SELECT (to_regclass('public.invoice_types') IS NOT NULL)::text AS v");
  if (String(has01) !== "true") console.log("\n  ⚠️  receipt_types '01' MISSING — migration 000000 would fail at SET NOT NULL. Resolve before --apply.");
  const { rows } = await c.query("SELECT filename FROM public.schema_migrations ORDER BY filename");
  console.log("\n-- schema_migrations --");
  for (const r2 of rows) console.log("  " + r2.filename);
}

async function backup(c) {
  const dir = resolve(root, "backups");
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  // The only destructive change is dropping student_invoices.invoice_name.
  const { rows: names } = await c.query("SELECT id, invoice_name FROM public.student_invoices ORDER BY id");
  const nameFile = resolve(dir, `prod-invoice_name-${ts}.json`);
  writeFileSync(nameFile, JSON.stringify(names, null, 2));
  const { rows: sm } = await c.query("SELECT filename, applied_at FROM public.schema_migrations ORDER BY filename");
  const smFile = resolve(dir, `prod-schema_migrations-${ts}.json`);
  writeFileSync(smFile, JSON.stringify(sm, null, 2));
  console.log(`Backed up ${names.length} student_invoices.invoice_name rows → ${nameFile}`);
  console.log(`Backed up schema_migrations → ${smFile}`);
}

async function apply(c) {
  // Guard: ensure backfill source exists.
  const { rows: g } = await c.query("SELECT EXISTS(SELECT 1 FROM public.receipt_types WHERE code='01') AS ok");
  if (!g[0].ok) throw new Error("receipt_types '01' missing — aborting before destructive migration.");

  const dir = resolve(root, "supabase/migrations");
  const files = readdirSync(dir).filter((n) => n.endsWith(".sql")).sort();
  const { rows: appliedRows } = await c.query("SELECT filename FROM public.schema_migrations");
  const applied = new Set(appliedRows.map((r) => r.filename));
  const pending = files.filter((f) => !applied.has(f));
  console.log("Pending migrations:", pending.length ? pending.join(", ") : "(none)");
  for (const f of pending) {
    const sql = readFileSync(resolve(dir, f), "utf8");
    console.log(`→ ${f}…`);
    await c.query("BEGIN");
    try {
      await c.query(sql);
      await c.query("INSERT INTO public.schema_migrations (filename) VALUES ($1)", [f]);
      await c.query("COMMIT");
      console.log(`  ✓ ${f}`);
    } catch (e) { await c.query("ROLLBACK"); throw new Error(`${f} failed: ${e.message}`); }
  }
  console.log("→ seed…");
  await c.query(readFileSync(resolve(root, "supabase/seed.sql"), "utf8"));
  console.log("  ✓ seed");
  const { rows } = await c.query("SELECT to_regclass('public.invoice_types') IS NOT NULL AS ok");
  console.log(`\ninvoice_types present: ${rows[0].ok ? "YES ✓" : "NO ✗"}`);
}

async function main() {
  const env = loadEnv();
  console.log(`Env: ${ENV_FILE} · project: ${ref(env.NEXT_PUBLIC_SUPABASE_URL || "")}`);
  const c = await connect(env);
  try {
    if (process.argv.includes("--check")) await check(c);
    else if (process.argv.includes("--backup")) await backup(c);
    else if (process.argv.includes("--apply")) await apply(c);
    else console.log("Pass one of: --check | --backup | --apply");
  } finally { await c.end(); }
}
main().catch((e) => { console.error("\nFailed:", e.message); process.exit(1); });

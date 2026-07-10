/**
 * TEMPORARY: apply exactly the two new XLSX-backfill-import migrations to a
 * remote Supabase Postgres DB via the IPv4 session pooler (direct host is
 * IPv6-only and unreachable from some networks — see memory/
 * supabase-migration-connectivity.md). Deliberately narrow: touches only
 * these two files, never seed.sql, never any other pending migration.
 *
 *   node scripts/_apply-xlsx-migrations.mjs --env .env.prod --check
 *   node scripts/_apply-xlsx-migrations.mjs --env .env.prod --apply
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const ENV_FILE = (() => {
  const i = process.argv.indexOf("--env");
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : ".env.prod";
})();

const TARGET_FILES = [
  "20260710000000_backfill_payment_discount.sql",
  "20260710000100_invoice_discount_log.sql",
];

const REGIONS = [
  "ap-southeast-1", "ap-northeast-1", "ap-southeast-2", "ap-northeast-2",
  "ap-south-1", "us-east-1", "us-east-2", "us-west-1",
  "eu-central-1", "eu-west-1", "eu-west-2", "sa-east-1",
];

function loadEnv() {
  const path = resolve(root, ENV_FILE);
  if (!existsSync(path)) { console.error(`Missing ${ENV_FILE}`); process.exit(1); }
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).replace(/\r$/, "").trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

function ref(url) {
  return url.replace(/^https?:\/\//, "").replace(/\.supabase\.co\/?$/, "");
}

async function connect(env) {
  const r = ref(env.NEXT_PUBLIC_SUPABASE_URL || "");
  const password = env.SUPABASE_DB_PASSWORD || "";
  if (!r || !password) {
    throw new Error(`${ENV_FILE} is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_DB_PASSWORD`);
  }
  for (const prefix of ["aws-1", "aws-0"]) {
    for (const region of REGIONS) {
      const host = `${prefix}-${region}.pooler.supabase.com`;
      const client = new pg.Client({
        host, port: 5432, user: `postgres.${r}`, password, database: "postgres",
        ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000,
      });
      try {
        await client.connect();
        await client.query("SELECT 1");
        console.log(`Connected via ${host} (project ${r})\n`);
        return client;
      } catch (e) {
        await client.end().catch(() => {});
        if (/password authentication failed/i.test(e.message)) {
          throw new Error(`${host}: password rejected — check SUPABASE_DB_PASSWORD in ${ENV_FILE}`);
        }
      }
    }
  }
  throw new Error("No pooler region accepted a connection.");
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function check(client) {
  await ensureMigrationTable(client);
  const { rows } = await client.query(
    "SELECT filename FROM public.schema_migrations WHERE filename = ANY($1) ORDER BY filename",
    [TARGET_FILES],
  );
  const applied = new Set(rows.map((r) => r.filename));
  console.log("Target migrations status:");
  for (const f of TARGET_FILES) {
    console.log(`  ${applied.has(f) ? "✓ already applied" : "· pending"}  ${f}`);
  }
  const { rows: fnRows } = await client.query(
    "SELECT proname, pronargs FROM pg_proc WHERE proname IN ('record_backfill_payment', 'record_backfill_invoice_discount') ORDER BY proname, pronargs",
  );
  console.log("\nExisting matching-name functions in DB:");
  for (const r of fnRows) console.log(`  ${r.proname}/${r.pronargs} args`);
}

async function apply(client) {
  await ensureMigrationTable(client);
  const { rows } = await client.query(
    "SELECT filename FROM public.schema_migrations WHERE filename = ANY($1)",
    [TARGET_FILES],
  );
  const applied = new Set(rows.map((r) => r.filename));
  const pending = TARGET_FILES.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("Both target migrations are already recorded as applied. Nothing to do.");
    return;
  }

  console.log("Pending:", pending.join(", "));
  for (const file of pending) {
    const sql = readFileSync(resolve(root, "supabase/migrations", file), "utf8");
    console.log(`→ ${file}…`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO public.schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`  ✓ ${file}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`${file} failed: ${e.message}`);
    }
  }
  console.log("\nDone.");
}

async function main() {
  const env = loadEnv();
  console.log(`Env: ${ENV_FILE} · project: ${ref(env.NEXT_PUBLIC_SUPABASE_URL || "")}`);
  const client = await connect(env);
  try {
    if (process.argv.includes("--check")) await check(client);
    else if (process.argv.includes("--apply")) await apply(client);
    else console.log("Pass one of: --check | --apply");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("\nFailed:", e.message);
  process.exit(1);
});

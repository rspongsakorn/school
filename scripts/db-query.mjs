/**
 * Run SQL against a Supabase Postgres and print the result.
 *
 * This is the project's stand-in for `psql`, which is not installed on the
 * Windows dev machines this repo is worked on — and neither is Docker, so the
 * `supabase db reset` loop is unavailable too. `pg` is already a devDependency
 * (scripts/setup-database.mjs uses it), so this needs nothing new.
 *
 * Usage:
 *   node scripts/db-query.mjs <envFile> -c "SELECT 1"
 *   node scripts/db-query.mjs <envFile> -f path/to/file.sql
 *
 * Options:
 *   --rollback       wrap the SQL in a transaction that is always rolled back.
 *                    Use for probes that write, so the database is untouched.
 *   --expect-error   succeed (exit 0) only if the SQL raises an error, and
 *                    print the message. Use to prove a constraint actually
 *                    bites. Implies --rollback.
 *
 * The target host is printed before anything runs, so a wrong database is
 * caught before the SQL does.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

function usage(message) {
  console.error(`${message}

usage: node scripts/db-query.mjs <envFile> (-c "SQL" | -f file.sql) [--rollback] [--expect-error]`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const envFile = argv[0];
if (!envFile || envFile.startsWith("-")) usage("Missing <envFile>.");

const rollback = argv.includes("--rollback") || argv.includes("--expect-error");
const expectError = argv.includes("--expect-error");

let sql;
const cIdx = argv.indexOf("-c");
const fIdx = argv.indexOf("-f");
if (cIdx !== -1 && argv[cIdx + 1]) sql = argv[cIdx + 1];
else if (fIdx !== -1 && argv[fIdx + 1]) sql = readFileSync(argv[fIdx + 1], "utf8");
else usage("Provide either -c \"SQL\" or -f file.sql.");

function loadEnv(file) {
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv(envFile);
const connectionString =
  env.DATABASE_URL ??
  (() => {
    const ref = (env.NEXT_PUBLIC_SUPABASE_URL ?? "")
      .replace(/^https?:\/\//, "")
      .replace(/\.supabase\.co\/?$/, "");
    if (!ref || !env.SUPABASE_DB_PASSWORD) {
      usage(`${envFile} needs DATABASE_URL, or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD.`);
    }
    return `postgresql://postgres:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@db.${ref}.supabase.co:5432/postgres`;
  })();

const host = connectionString.replace(/^postgres(ql)?:\/\/[^@]*@/, "").replace(/\/.*$/, "");
console.log(`Env:    ${envFile}`);
console.log(`Target: ${host}${rollback ? "  (rolled back)" : ""}\n`);

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

let failure = null;
try {
  if (rollback) await client.query("BEGIN");
  const result = await client.query(sql);
  const results = Array.isArray(result) ? result : [result];
  for (const r of results) {
    if (r.rows?.length) console.table(r.rows);
    else console.log(`${r.command ?? "OK"} ${r.rowCount ?? 0}`);
  }
} catch (err) {
  failure = err;
} finally {
  if (rollback) await client.query("ROLLBACK").catch(() => {});
  await client.end();
}

if (expectError) {
  if (failure) {
    console.log(`expected error raised: ${failure.message}`);
    process.exit(0);
  }
  console.error("FAILED: expected an error, but the SQL succeeded.");
  process.exit(1);
}

if (failure) {
  console.error(`ERROR: ${failure.message}`);
  process.exit(1);
}

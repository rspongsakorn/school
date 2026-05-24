/**
 * Apply supabase/migrations + seed to a remote Supabase Postgres database.
 *
 * Requires in .env.local (one of):
 *   DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
 *   SUPABASE_DB_PASSWORD=your-database-password
 *     (uses NEXT_PUBLIC_SUPABASE_URL to derive project ref)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function getConnectionString(env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;

  const password = env.SUPABASE_DB_PASSWORD;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!password || !url) {
    console.error(`
Cannot connect to Postgres. Add one of these to .env.local:

  DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres

  — or —

  SUPABASE_DB_PASSWORD=YOUR_PASSWORD
  NEXT_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co

Database password: Supabase Dashboard → Project Settings → Database → Database password
`);
    process.exit(1);
  }

  const ref = url.replace(/^https?:\/\//, "").replace(/\.supabase\.co\/?$/, "");
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function runSql(client, label, sql) {
  console.log(`→ ${label}…`);
  await client.query(sql);
  console.log(`  ✓ ${label}`);
}

async function main() {
  const env = loadEnvLocal();
  const connectionString = getConnectionString(env);

  const migrationPath = resolve(
    root,
    "supabase/migrations/20260524120000_initial_schema.sql"
  );
  const seedPath = resolve(root, "supabase/seed.sql");

  const migrationSql = readFileSync(migrationPath, "utf8");
  const seedSql = readFileSync(seedPath, "utf8");

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Connected to Supabase Postgres.\n");

    await runSql(client, "initial_schema migration", migrationSql);
    await runSql(client, "seed data", seedSql);

    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    console.log("\nPublic tables:");
    for (const row of rows) {
      console.log(`  - ${row.table_name}`);
    }

    const { rows: seeds } = await client.query(
      `SELECT code, name FROM public.receipt_types ORDER BY code`
    );
    console.log("\nreceipt_types seed:");
    for (const row of seeds) {
      console.log(`  - ${row.code}: ${row.name}`);
    }

    console.log("\nDatabase setup complete.");
  } catch (err) {
    if (err.code === "42P07") {
      console.error(
        "\nSome objects already exist. If this is a re-run on a partial setup, reset the DB in Dashboard → Database → Reset, or drop public schema objects first."
      );
    }
    console.error("\nSetup failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

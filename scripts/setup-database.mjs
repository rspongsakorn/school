/**
 * Apply pending supabase/migrations + seed to a remote Supabase Postgres database.
 *
 * Tracks applied migrations in public.schema_migrations so re-runs are safe on
 * databases that already have the initial schema.
 *
 * Requires in .env.local (one of):
 *   DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
 *   SUPABASE_DB_PASSWORD=your-database-password
 *     (uses NEXT_PUBLIC_SUPABASE_URL to derive project ref)
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
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

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query(
    "SELECT filename FROM public.schema_migrations ORDER BY filename",
  );
  return new Set(rows.map((row) => row.filename));
}

async function bootstrapExistingDatabase(client, migrationFiles) {
  const applied = await getAppliedMigrations(client);
  if (applied.size > 0) return;

  const { rows } = await client.query(
    "SELECT 1 FROM pg_type WHERE typname = 'student_status' LIMIT 1",
  );
  if (rows.length === 0) return;

  const initialMigration = migrationFiles.find((file) => file.includes("initial_schema"));
  if (!initialMigration) return;

  await client.query(
    "INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
    [initialMigration],
  );
  console.log(`  ↷ Skipping ${initialMigration} (database already initialized)\n`);
}

async function runMigration(client, filename, sql) {
  console.log(`→ ${filename}…`);
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      "INSERT INTO public.schema_migrations (filename) VALUES ($1)",
      [filename],
    );
    await client.query("COMMIT");
    console.log(`  ✓ ${filename}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function runSql(client, label, sql) {
  console.log(`→ ${label}…`);
  await client.query(sql);
  console.log(`  ✓ ${label}`);
}

async function main() {
  const env = loadEnvLocal();
  const connectionString = getConnectionString(env);

  const migrationsDir = resolve(root, "supabase/migrations");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const seedPath = resolve(root, "supabase/seed.sql");
  const seedSql = readFileSync(seedPath, "utf8");

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Connected to Supabase Postgres.\n");

    await ensureMigrationTable(client);
    await bootstrapExistingDatabase(client, migrationFiles);

    const applied = await getAppliedMigrations(client);
    const pending = migrationFiles.filter((file) => !applied.has(file));

    if (pending.length === 0) {
      console.log("No pending migrations.");
    } else {
      for (const file of pending) {
        const migrationSql = readFileSync(resolve(migrationsDir, file), "utf8");
        await runMigration(client, file, migrationSql);
      }
    }

    await runSql(client, "seed data", seedSql);

    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    console.log("\nPublic tables:");
    for (const row of rows) {
      console.log(`  - ${row.table_name}`);
    }

    const { rows: seeds } = await client.query(
      "SELECT code, name FROM public.invoice_types ORDER BY code",
    );
    console.log("\ninvoice_types seed:");
    for (const row of seeds) {
      console.log(`  - ${row.code}: ${row.name}`);
    }

    console.log("\nDatabase setup complete.");
  } catch (err) {
    console.error("\nSetup failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

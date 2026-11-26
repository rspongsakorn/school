/**
 * Run the dev server against the `school` test project instead of whatever
 * `.env.local` points at.
 *
 *   npm run dev:school
 *
 * `.env.local` holds the live project's credentials, and Next.js reads it
 * automatically, so pointing the app at the test database by editing that file
 * is one forgotten revert away from developing against real school data. This
 * loads `.env.school` over the top for this process only and leaves every env
 * file untouched.
 *
 * `node --env-file=.env.school next dev` does not work: Next re-execs itself
 * and Node refuses `--env-file` when it arrives via NODE_OPTIONS.
 */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const ENV_FILE = ".env.school";

const overrides = {};
for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (match) overrides[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
}

const url = overrides.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !overrides.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error(
    `${ENV_FILE} needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to run the app.`,
  );
  process.exit(1);
}

// Say which project this is before Next prints anything, so a wrong database is
// obvious rather than something you notice three screens later.
console.log(`\n  dev server -> ${url}  (from ${ENV_FILE}, not .env.local)\n`);

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

// NEXT_PUBLIC_* values are inlined at build time, so a stale .next from a run
// against a different project would serve the wrong URL and key.
const child = spawn(process.execPath, [nextBin, "dev"], {
  stdio: "inherit",
  env: { ...process.env, ...overrides },
});

child.on("exit", (code) => process.exit(code ?? 0));

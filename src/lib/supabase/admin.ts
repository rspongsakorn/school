import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Creates a Supabase client authenticated with the service role key.
 * This client bypasses ALL Row Level Security policies — use only for
 * trusted administrative operations (e.g., user provisioning).
 *
 * Uses `createClient` directly (not `createServerClient`) because admin
 * operations do not need cookie-based session management.
 *
 * ONLY import this in Server Components, Server Actions, or Route Handlers.
 * The `server-only` import above enforces this at build time.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing required env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient<Database>(url, key);
}

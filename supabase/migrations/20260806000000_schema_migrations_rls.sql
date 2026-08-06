-- public.schema_migrations is the only table in public with RLS disabled. It
-- is not created by a migration — setup-database.mjs / _apply-xlsx-migrations.mjs
-- create it with CREATE TABLE IF NOT EXISTS before any migration runs — so it
-- never went through the RLS setup the rest of the schema did, while Supabase's
-- default privileges still granted anon and authenticated full DML on it. That
-- left the migration ledger writable by anyone holding the anon key (which
-- ships to the browser): wiping it would make the next setup run believe no
-- migration had ever been applied and replay the whole schema over live data.
--
-- Nothing reaches this table through PostgREST by design. Every reader and
-- writer is a migration script connecting directly as postgres, the table
-- owner, which is exempt from RLS (no FORCE ROW LEVEL SECURITY here), so
-- enabling RLS with no policies at all is exactly right: it denies anon and
-- authenticated outright rather than describing an access pattern we want.
--
-- Both statements are idempotent, so a fresh database picks this up when the
-- migration runs right after the bootstrap CREATE TABLE.

REVOKE ALL ON public.schema_migrations FROM anon, authenticated;

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

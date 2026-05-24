# Supabase database

Schema from [tuition management design spec](../docs/superpowers/specs/2026-05-24-tuition-management-design.md) (§3–§5).

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm i -g supabase` or use `npx supabase`)
- Docker Desktop (for local `supabase start`)

## Remote project (recommended)

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Link and push migrations:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
```

3. Copy API keys into `.env.local` (see repo root `.env.example`).

4. Apply seed on a fresh DB (optional — also runs on local reset):

```bash
# SQL Editor, or after link:
psql "$DATABASE_URL" -f supabase/seed.sql
```

## Local development

```bash
npm run db:start    # starts Postgres, Auth, Studio (http://127.0.0.1:54323)
npm run db:reset    # reapplies migrations + seed.sql
npm run db:stop
```

Local API URL and keys are printed after `db:start`. Use those in `.env.local` for local Next.js.

## Migrations

| File | Contents |
|------|----------|
| `migrations/20260524120000_initial_schema.sql` | Tables, enums, indexes, RLS, auth profile trigger |
| `seed.sql` | Default receipt type `01 — ค่าธรรมเนียมการศึกษา` |

Add new migrations with:

```bash
npx supabase migration new your_change_name
```

## First admin user

1. Sign up via Supabase Auth (or Dashboard → Authentication → Add user).
2. In SQL Editor, activate and promote:

```sql
UPDATE public.profiles
SET role = 'admin', is_active = true, display_name = 'ผู้ดูแลระบบ'
WHERE id = 'YOUR_AUTH_USER_UUID';
```

New signups default to `teacher` with `is_active = false` until an admin enables them.

## npm scripts (repo root)

| Script | Command |
|--------|---------|
| `npm run db:start` | `supabase start` |
| `npm run db:stop` | `supabase stop` |
| `npm run db:reset` | `supabase db reset` |
| `npm run db:push` | `supabase db push` |

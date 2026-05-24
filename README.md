# School Tuition CMS

Next.js frontend based on [v0 Thai School Admin](https://v0-thai-school-admin-app.vercel.app/).

## Run locally

```bash
npm install
cp .env.example .env.local   # add Supabase URL, keys, and SUPABASE_DB_PASSWORD
npm run db:setup             # first time only — applies schema + seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — redirects to `/login` until signed in.

## Stack

- Next.js 16 App Router
- Supabase (Auth + PostgreSQL + RLS)
- shadcn/ui + Tailwind CSS v4
- Theme: school blue `#1B6CA8`, light background `#F8FAFC`
- Thai UI (Noto Sans Thai + Inter)

## Routes

| Path | Screen |
|------|--------|
| `/login` | เข้าสู่ระบบ |
| `/` | ภาพรวม (dashboard, Supabase data) |
| `/students` | รายชื่อนักเรียน |
| `/payments` | บันทึกการจ่าย (placeholder) |
| `/reports` | รายงาน (placeholder) |

## Database (Supabase)

Schema and RLS live in [`supabase/`](supabase/README.md). Quick start:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
```

Copy `.env.example` → `.env.local` with your project API keys. See [supabase/README.md](supabase/README.md) for local Docker setup and first admin user.

## Design docs

- [Design spec](docs/superpowers/specs/2026-05-24-tuition-management-design.md)
- [v0 UI prompts](docs/superpowers/specs/v0-ui-prompts.md)

## v0 reference

- Production: https://v0-thai-school-admin-app.vercel.app/
- Chat: https://v0.app/chat/thai-school-admin-app-cfvfb3gjEMm

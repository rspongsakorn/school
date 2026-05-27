# Dashboard Client-Side Migration Design

**Date:** 2026-05-28  
**Status:** Approved  
**Goal:** Eliminate 450-600ms RSC navigation latency by migrating dashboard from server-heavy rendering to client-side SPA pattern.

---

## Problem

Every dashboard navigation triggers a full RSC roundtrip with 3-5 sequential Supabase calls on the server:

1. `supabase.auth.getUser()` — network call to Supabase auth server (~100-150ms)
2. `profiles` DB query (~50ms)
3. `academic_years` DB query (~50ms)
4. `semesters` DB query (~50ms)
5. Page-specific data query (~80ms)

Root causes:
- `cookies()` in `createClient()` forces dynamic rendering — no caching possible
- React `cache()` only deduplicates within a single request, not across navigations
- `src/proxy.ts` is misnamed — Next.js requires `middleware.ts`, so **no middleware is running**
- Every dashboard page is an async Server Component repeating auth + context fetches

---

## Solution: Full Client-Side Architecture

Convert dashboard from server-rendered pages to a client-side SPA shell with TanStack Query for data fetching.

### Navigation flow (after migration)

```
User clicks link
  → Next.js client-side navigation (~0ms server)
  → Page component re-renders (in-memory)
  → TanStack Query checks cache:
      cache hit (staleTime not exceeded) → render immediately
      cache stale → show cached data + refetch in background
      cache miss → show skeleton → fetch → render
```

Auth check happens once per session mount, not per navigation.

---

## Architecture

### Layer 1: Middleware (`src/middleware.ts`)

Replaces `src/proxy.ts` (which was never running).

- **Only checks cookie presence** — no `getUser()`, no DB query
- Cost: ~0ms (edge function, no network calls)
- If no session cookie → redirect `/login`
- If cookie present → pass through (AuthProvider verifies on mount)
- Expired-but-present cookies: AuthProvider catches and redirects

```
matcher: all routes except _next/static, _next/image, favicon.ico, /login, /auth, and static file extensions
```

### Layer 2: Providers (`src/app/layout.tsx`)

Root layout wraps children with:
- `QueryProvider` — TanStack Query client (staleTime: 30s, gcTime: 5min)
- `AuthProvider` — session + profile context

### Layer 3: AuthProvider (`src/components/providers/auth-provider.tsx`)

- Calls `supabase.auth.getUser()` once on mount
- Fetches `profiles` row once per session
- Stores `{ user, profile, isLoading }` in React Context
- Subscribes to `onAuthStateChange` for logout/token refresh
- If `!user` after loading → `router.push('/login')`

**`useAuth()` hook** — any component reads user/profile/role without server calls.

**`useRequireRole(role)` hook** — client-side role guard, reads from AuthProvider context (no DB call). Used in panels that were previously using `requireAdminPage()`.

Server Actions (`requireAdminAction`, `requireFinanceAction`) remain unchanged — they still do server-side auth checks for mutations.

### Layer 4: Dashboard Layout (`src/app/(dashboard)/layout.tsx`)

Converted to `"use client"`. Uses `useAuth()`:
- While `isLoading` → full-page spinner
- Once loaded → renders `AppSidebar` + children

### Layer 5: Page Shells (`src/app/(dashboard)/*/page.tsx`)

Every dashboard page becomes a **thin, non-async shell** with no imports from server-only modules:

```ts
// Pattern — no async, no await, no server imports
import { StudentsPanel } from "@/components/students/students-panel"
export default function StudentsPage() {
  return <StudentsPanel />
}
```

`AppHeader` (already `"use client"`) becomes self-contained — reads `displayName` from `useAuth()` and semester context from `useSemesterContext()` directly. Pages no longer pass those props down, making the shell truly empty of data concerns.

### Layer 6: Client Panels (`src/components/**/*-panel.tsx`)

All existing panel components gain `"use client"` and switch data fetching to TanStack Query:

```ts
"use client"
const { data, isLoading, isError } = useQuery({
  queryKey: ['students', semesterId, q, page],
  queryFn: () => fetchStudents({ semesterId, q, page }),
  staleTime: 30_000,
})
```

Loading state: skeleton (reference existing `loading.tsx` patterns).  
Error state: inline error message.

### Layer 7: Query Functions (`src/lib/queries/`)

New directory — browser-client versions of data fetches, separated from `src/lib/data/` (which stays for Server Actions):

```
src/lib/queries/
├── students.ts
├── academic-years.ts
├── semesters.ts
├── invoices.ts
├── payments.ts
├── fee-rates.ts
├── receipt-types.ts
├── enrollments.ts
└── dashboard.ts
```

Each file uses `createBrowserClient` from `src/lib/supabase/client.ts`.

### Layer 8: SemesterContext (client)

`loadSemesterPageContext` (server, reads cookies + 2 DB queries per navigation) is replaced by:

**`useSemesterContext()` hook:**
- `useQuery(['academic-years'])` — fetched once, cached entire session
- `useQuery(['semesters', yearId])` — cached per year
- Selected year/semester read from `useSearchParams()` (URL state) with cookie fallback
- All pages share the same cache → zero extra fetches when navigating between pages

---

## Files Changed

### New files
| File | Purpose |
|------|---------|
| `src/middleware.ts` | Cookie-presence auth guard (replaces proxy.ts) |
| `src/components/providers/auth-provider.tsx` | Session + profile context |
| `src/components/providers/query-provider.tsx` | TanStack Query client wrapper |
| `src/lib/queries/students.ts` | Browser client student queries |
| `src/lib/queries/academic-years.ts` | Browser client academic year queries |
| `src/lib/queries/semesters.ts` | Browser client semester queries |
| `src/lib/queries/invoices.ts` | Browser client invoice queries |
| `src/lib/queries/payments.ts` | Browser client payment queries |
| `src/lib/queries/fee-rates.ts` | Browser client fee rate queries |
| `src/lib/queries/receipt-types.ts` | Browser client receipt type queries |
| `src/lib/queries/dashboard.ts` | Browser client dashboard queries |

### Modified files
| File | Change |
|------|--------|
| `src/app/layout.tsx` | Add QueryProvider + AuthProvider wrappers |
| `src/app/(dashboard)/layout.tsx` | Convert to "use client", add auth guard |
| `src/app/(dashboard)/page.tsx` | Thin shell, remove server data fetching |
| `src/app/(dashboard)/students/page.tsx` | Thin shell |
| `src/app/(dashboard)/academic-year/page.tsx` | Thin shell |
| `src/app/(dashboard)/academic-year/new/page.tsx` | Thin shell |
| `src/app/(dashboard)/academic-year/[id]/page.tsx` | Thin shell |
| `src/app/(dashboard)/fee-rates/page.tsx` | Thin shell |
| `src/app/(dashboard)/invoices/page.tsx` | Thin shell |
| `src/app/(dashboard)/payments/page.tsx` | Thin shell |
| `src/app/(dashboard)/receipt-types/page.tsx` | Thin shell |
| `src/app/(dashboard)/registration/page.tsx` | Thin shell |
| `src/app/(dashboard)/registration/setup/page.tsx` | Thin shell |
| `src/app/(dashboard)/reports/page.tsx` | Thin shell |
| `src/app/(dashboard)/reports/outstanding/page.tsx` | Thin shell |
| `src/app/(dashboard)/reports/collections/page.tsx` | Thin shell |
| `src/components/students/students-panel.tsx` | Add "use client" + useQuery |
| `src/components/dashboard/stat-cards.tsx` | Add "use client" + useQuery |
| `src/components/dashboard/overdue-list.tsx` | Add "use client" + useQuery |
| `src/components/dashboard/recent-payments-table.tsx` | Add "use client" + useQuery |
| `src/components/dashboard/grade-stats.tsx` | Add "use client" + useQuery |
| All other panel components | Add "use client" + useQuery |

### Deleted files
| File | Reason |
|------|--------|
| `src/proxy.ts` | Never ran as middleware; replaced by `src/middleware.ts` |

### Unchanged files
| File | Reason |
|------|--------|
| `src/lib/actions/*.ts` | Server Actions for mutations — still called from client components, still do server-side auth |
| `src/lib/data/*.ts` | Keep for Server Actions to use |
| `src/lib/auth/require-admin.ts` | Used by Server Actions only |
| `src/lib/auth/require-finance.ts` | Used by Server Actions only |
| `src/lib/supabase/client.ts` | Used by query functions |
| `src/lib/supabase/server.ts` | Used by Server Actions |

---

## Dependencies to Install

```
@tanstack/react-query
```

No other new dependencies required.

---

## Performance Targets

| Metric | Before | After |
|--------|--------|-------|
| Navigation latency | 450-600ms | <50ms (client re-render) |
| Initial page load | ~600ms | ~300ms (shell + parallel fetch) |
| Auth calls per navigation | 1-2 (server) | 0 (cached in AuthProvider) |
| DB calls per navigation | 3-5 (server) | 0-1 (TanStack Query cache hit) |
| RSC `?_rsc=` requests | Every navigation | Hard refresh only |

---

## Region Configuration (Manual Check)

Not a code change. Before deploying:
- Verify Vercel function region matches Supabase project region
- If Supabase is `ap-southeast-1` (Singapore) → set Vercel to `sin1`
- With client-side architecture, the client connects directly to Supabase — Vercel region matters less than before, but API routes and Server Actions still benefit from proximity

---

## Constraints and Decisions

- **Server Actions kept**: Mutations still go through server-side auth. Client-side role guards (`useRequireRole`) are UI-only — actual permission enforcement is in Server Actions.
- **No API routes added**: Server Actions cover mutations adequately. New `src/lib/queries/` functions are client-side fetches directly to Supabase, not through Next.js API routes.
- **Cookie-only middleware**: The middleware does not call `getUser()` to avoid adding latency to every request. Expired tokens are handled gracefully by AuthProvider redirecting to login.
- **`src/lib/data/` preserved**: These server-side query functions remain for use by Server Actions. They are not used by client components after migration.

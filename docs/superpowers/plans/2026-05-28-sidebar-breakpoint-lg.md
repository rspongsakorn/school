# Sidebar Breakpoint lg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the sidebar responsive breakpoint from `md` (768px) to `lg` (1024px) so tablet devices (640–1024px) also use the hamburger + Sheet drawer instead of the fixed sidebar.

**Architecture:** Three Tailwind class strings each get one prefix swapped from `md:` to `lg:`. No logic changes — the useSidebar hook, Sheet drawer, and auto-close behaviour are all unchanged from the previous implementation.

**Tech Stack:** Next.js 16, Tailwind CSS (lg breakpoint = 1024px)

---

## File Map

| File | Change |
|------|--------|
| `src/components/app-sidebar.tsx` | `md:flex` → `lg:flex` on desktop aside |
| `src/components/app-header.tsx` | `md:hidden` → `lg:hidden` on hamburger button |
| `src/app/(dashboard)/layout.tsx` | `md:ml-[260px]` → `lg:ml-[260px]` on content wrapper |

---

## Task 1: Swap breakpoint prefix in all three files

**Files:**
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/components/app-header.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Update `app-sidebar.tsx`**

Open `src/components/app-sidebar.tsx`. Find the desktop `<aside>` element (inside `AppSidebar`):

```tsx
// FIND:
<aside className="fixed left-0 top-0 z-40 hidden h-screen w-[260px] flex-col border-r border-border bg-sidebar md:flex">

// REPLACE WITH:
<aside className="fixed left-0 top-0 z-40 hidden h-screen w-[260px] flex-col border-r border-border bg-sidebar lg:flex">
```

- [ ] **Step 2: Update `app-header.tsx`**

Open `src/components/app-header.tsx`. Find the hamburger `<button>`:

```tsx
// FIND:
className="-ml-1 mr-3 flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-accent md:hidden"

// REPLACE WITH:
className="-ml-1 mr-3 flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-accent lg:hidden"
```

- [ ] **Step 3: Update `layout.tsx`**

Open `src/app/(dashboard)/layout.tsx`. Find the content wrapper div:

```tsx
// FIND:
<div className="md:ml-[260px]">{children}</div>

// REPLACE WITH:
<div className="lg:ml-[260px]">{children}</div>
```

- [ ] **Step 4: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npx eslint src/components/app-sidebar.tsx src/components/app-header.tsx "src/app/(dashboard)/layout.tsx"
```

Expected: 0 errors in both commands.

- [ ] **Step 5: Manual test**

Start dev server: `yarn dev` (or `npm run dev`)

Open `http://localhost:3000` in browser DevTools.

| Viewport | Expected |
|----------|----------|
| 375px (mobile) | Hamburger visible, no sidebar, content full width |
| 768px (tablet) | Hamburger visible, no sidebar, content full width |
| 1024px (desktop boundary) | Sidebar hidden (lg starts at 1024px, so this is still tablet — hamburger shown) |
| 1100px (desktop) | Sidebar visible (260px), no hamburger, content offset |

Click hamburger at 768px → Sheet drawer slides in from left → click overlay → closes. Navigate to another page → drawer auto-closes.

- [ ] **Step 6: Commit**

```bash
git add src/components/app-sidebar.tsx src/components/app-header.tsx "src/app/(dashboard)/layout.tsx"
git commit -m "feat: change sidebar breakpoint from md to lg (tablet now uses drawer)"
```

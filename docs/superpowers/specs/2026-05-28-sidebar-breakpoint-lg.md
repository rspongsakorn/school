# Sidebar Breakpoint Change — md → lg

**Date:** 2026-05-28  
**Status:** Approved

---

## Overview

Change the sidebar responsive breakpoint from `md` (768px) to `lg` (1024px) so that both mobile AND tablet (< 1024px) use the hamburger + Sheet drawer, while only desktop (≥ 1024px) shows the fixed sidebar.

The architecture from the previous implementation (useSidebar context, Sheet drawer, auto-close on route change) is unchanged. Only three Tailwind class strings need to be updated.

---

## Breakpoints

| Range | Behavior |
|-------|----------|
| `< 1024px` (mobile + tablet, below `lg`) | Hamburger button visible, sidebar hidden, Sheet drawer on demand |
| `≥ 1024px` (desktop, `lg` and above) | Fixed sidebar 260px always visible, hamburger hidden |

Auto-close on route change applies to all screen sizes (already implemented via `useEffect([pathname])`).

---

## Changes

### `src/components/app-sidebar.tsx`

Desktop aside class:
- Before: `"fixed left-0 top-0 z-40 hidden h-screen w-[260px] flex-col border-r border-border bg-sidebar md:flex"`
- After:  `"fixed left-0 top-0 z-40 hidden h-screen w-[260px] flex-col border-r border-border bg-sidebar lg:flex"`

### `src/components/app-header.tsx`

Hamburger button class:
- Before: `"-ml-1 mr-3 flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-accent md:hidden"`
- After:  `"-ml-1 mr-3 flex h-8 w-8 items-center justify-center rounded-md text-foreground hover:bg-accent lg:hidden"`

### `src/app/(dashboard)/layout.tsx`

Content wrapper class:
- Before: `"md:ml-[260px]"`
- After:  `"lg:ml-[260px]"`

---

## Out of Scope

- Hook logic, Sheet component, animation — unchanged
- Dashboard card grid, table stacked cards, spacing — separate subsystems

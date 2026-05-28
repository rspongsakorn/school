# Responsive Design — Mobile & Tablet Support

**Date:** 2026-05-28  
**Status:** Approved

---

## Overview

Add responsive design support to the school management system dashboard. The system currently uses a fixed 260px sidebar with hardcoded `ml-[260px]` that breaks on small screens. The goal is mobile and tablet support with minimal structural change.

---

## Breakpoints

| Range | Category | Behavior |
|-------|----------|----------|
| `< 768px` (below `md`) | Mobile | Hamburger header + slide-in Sheet drawer |
| `≥ 768px` (`md` and above) | Tablet & Desktop | Fixed sidebar 260px always visible |

---

## Navigation

### Mobile (< 768px)
- Sidebar is hidden (`hidden md:flex` on the `<aside>`)
- Top header shows a hamburger button (`<Menu>` icon, lucide-react) on the far left
- Tapping hamburger sets `isOpen = true` → Sheet slides in from the left
- Tapping a nav link or the overlay closes the drawer (`isOpen = false`)
- Drawer closes automatically when pathname changes (route navigation)

### Tablet & Desktop (≥ 768px)
- Fixed sidebar renders as usual (260px, always visible)
- `isOpen` state is unused; hamburger button is hidden (`md:hidden`)

---

## Architecture

### New file: `src/hooks/use-sidebar.ts`
A small hook that manages drawer open/close state and auto-closes on route change.

```ts
// API
const { isOpen, open, close, toggle } = useSidebar()
```

Internally uses `usePathname()` + `useEffect` to call `close()` whenever the pathname changes.

### Modified: `src/components/app-sidebar.tsx`

Extract nav JSX into a private `<SidebarContent>` component within the same file. The exported `AppSidebar` renders two things:

1. **Desktop aside** — `<aside className="hidden md:flex fixed left-0 top-0 z-40 h-screen w-[260px] flex-col border-r border-border bg-sidebar">` containing `<SidebarContent />`
2. **Mobile Sheet** — `<Sheet open={open} onOpenChange={...}><SheetContent side="left" className="w-[260px] p-0" showCloseButton={false}><SidebarContent /></SheetContent></Sheet>`

Props added: `open: boolean`, `onClose: () => void`

Nav items are defined once inside `<SidebarContent>` — no duplication.

### Modified: `src/components/app-header.tsx`

Add optional prop `onMenuClick?: () => void`.

Add hamburger button to the left of the title, visible only on mobile:
```tsx
{onMenuClick && (
  <button className="md:hidden mr-3 text-foreground" onClick={onMenuClick}>
    <Menu className="h-5 w-5" />
    <span className="sr-only">เปิดเมนู</span>
  </button>
)}
```

### Modified: `src/app/(dashboard)/layout.tsx`

Since `AppHeader` is rendered inside each page's children (not in the layout directly), `onMenuClick` cannot be passed as a prop from the layout. Use a **React context** to share sidebar state.

Create `SidebarContext` exported from `src/hooks/use-sidebar.ts`:
- Layout wraps children in `<SidebarProvider>`
- `AppHeader` calls `useSidebarContext()` to get `open` callback
- `AppSidebar` calls `useSidebarContext()` for `isOpen` and `close`

Layout changes:
```tsx
// ml-[260px] → md:ml-[260px]
<div className="md:ml-[260px]">{children}</div>
```

---

## Table Columns — Mobile Responsive

Add `className="hidden md:table-cell"` to non-essential `<TableHead>` and their paired `<TableCell>` elements.

| Page | Visible on Mobile | Hidden on Mobile |
|------|-------------------|-----------------|
| นักเรียน (`students-panel.tsx`) | ชื่อ-นามสกุล, ชั้น, สถานะ | รหัส, เลขบัตร |
| ใบแจ้งชำระ (`invoices-panel.tsx`) | ชื่อ-นามสกุล, ต้องชำระ, ค้าง, สถานะ | รหัส, ชั้น/ห้อง, ใบแจ้ง |
| บันทึกการจ่าย (`payments-panel.tsx`) | นักเรียน, วันที่, จำนวน, สถานะ | เลขที่, รหัส, ชั้น/ห้อง, วิธี |

Other pages (academic year, registration, receipt types, reports) have simple enough tables that no changes are needed.

---

## Out of Scope

- Bottom navigation bar (not selected)
- Card layout for tables (not selected — hide columns is sufficient)
- Changes to queries, data fetching, or business logic
- New pages or features

---

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/use-sidebar.ts` | New — hook + context |
| `src/components/app-sidebar.tsx` | Extract `SidebarContent`, add Sheet for mobile, consume context |
| `src/components/app-header.tsx` | Add hamburger button, consume sidebar context |
| `src/app/(dashboard)/layout.tsx` | Add `SidebarProvider`, change `ml-[260px]` → `md:ml-[260px]` |
| `src/components/students/students-panel.tsx` | Hide columns on mobile |
| `src/components/finance/invoices-panel.tsx` | Hide columns on mobile |
| `src/components/finance/payments-panel.tsx` | Hide columns on mobile |

# Fee Item Sort Order — Design Spec

**Date:** 2026-05-27
**Status:** Approved

## Problem

รายการค่าใช้จ่าย (fee items) ในตารางอัตราค่าธรรมเนียมตามชั้น ปัจจุบันเรียงตามชื่อ (alphabetical) โดยไม่สามารถกำหนดลำดับได้ ผู้ใช้ต้องการกำหนดลำดับคอลัมน์จากซ้ายไปขวาได้เอง

## Solution

เพิ่ม `sort_order` field ใน `fee_items` table และ UI Drag & Drop ใน `FeeItemsSection` component

---

## 1. Database Migration

**File:** `supabase/migrations/20260527000000_fee_items_sort_order.sql`

```sql
ALTER TABLE public.fee_items
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
```

ค่า default = 0 สำหรับ row เดิมทั้งหมด

---

## 2. Data Layer

### `src/lib/data/fee-items.ts`

- เพิ่ม `sortOrder: number` ใน `FeeItemRow` type
- เปลี่ยน `.order("name")` → `.order("sort_order", { ascending: true }).order("name", { ascending: true })` (name เป็น tiebreaker)
- map `sort_order` → `sortOrder` ใน return

### `src/lib/actions/fee-items.ts`

เพิ่ม server action ใหม่:

```ts
export async function reorderFeeItems(orderedIds: string[]): Promise<ActionState>
```

- รับ array ของ fee item ID ตามลำดับที่ต้องการ
- Loop update `sort_order = index` ทีละ row ด้วย Supabase `.update().eq("id", id)` (Supabase ไม่รองรับ batch update ต่างค่าต่อ row)
- Revalidate `/fee-rates`

---

## 3. UI

### Library

ติดตั้ง `@hello-pangea/dnd` — maintained fork ของ `react-beautiful-dnd`, API ง่าย, รองรับ vertical list reorder

### `src/components/finance/fee-items-section.tsx`

**State เพิ่ม:**
- `localItems: FeeItemRow[]` — local copy สำหรับ optimistic update (init จาก `items` prop)
- sync กลับจาก prop เมื่อ `items` เปลี่ยน (useEffect)

**Layout เพิ่ม:**
- คอลัมน์ซ้ายสุด: drag handle ใช้ `GripVertical` icon จาก lucide-react, `cursor-grab`

**Drag flow:**
1. Wrap table body ด้วย `<DragDropContext onDragEnd={handleDragEnd}>`
2. `<Droppable droppableId="fee-items">` ครอบ `<TableBody>`
3. แต่ละ `<TableRow>` เป็น `<Draggable draggableId={item.id}>`
4. `handleDragEnd`: reorder `localItems` ทันที (optimistic) → เรียก `reorderFeeItems` → ถ้าล้มเหลว: toast error + restore `localItems` กลับเป็นลำดับก่อนลาก

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260527000000_fee_items_sort_order.sql` | New — add `sort_order` column |
| `src/lib/data/fee-items.ts` | Add `sortOrder` to type, change order |
| `src/lib/actions/fee-items.ts` | Add `reorderFeeItems` action |
| `src/components/finance/fee-items-section.tsx` | Add DnD UI |
| `package.json` | Add `@hello-pangea/dnd` |

---

## Out of Scope

- ไม่เพิ่ม sort order ให้ `fee_items` ที่สร้างใหม่แบบอัตโนมัติ (default 0, ผู้ใช้ลากจัดเองได้)
- ไม่เปลี่ยน dialog เพิ่ม/แก้ไข fee item

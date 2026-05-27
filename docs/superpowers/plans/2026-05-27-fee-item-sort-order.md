# Fee Item Sort Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to reorder fee items (columns) in the fee rates matrix via drag & drop in the fee items list.

**Architecture:** Add `sort_order` column to `fee_items` DB table. Update the data layer to sort by it. Add a `reorderFeeItems` server action. Wire up `@hello-pangea/dnd` drag-and-drop in the `FeeItemsSection` component with optimistic updates.

**Tech Stack:** Next.js 16, Supabase, `@hello-pangea/dnd`, Vitest, TypeScript

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260527000000_fee_items_sort_order.sql` | Create | Add `sort_order` column |
| `src/lib/finance/reorder.ts` | Create | Pure helper: `reorderItems()` |
| `src/lib/finance/reorder.test.ts` | Create | Unit tests for helper |
| `src/lib/data/fee-items.ts` | Modify | Add `sortOrder` to type, fix ordering |
| `src/lib/actions/fee-items.ts` | Modify | Add `reorderFeeItems` server action |
| `src/components/finance/fee-items-section.tsx` | Modify | Add DnD UI |

---

## Task 1: Install `@hello-pangea/dnd`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
npm install @hello-pangea/dnd
```

Expected: `package.json` updated with `"@hello-pangea/dnd"` in dependencies, `node_modules/@hello-pangea/dnd` exists.

- [ ] **Step 2: Verify types are included**

```bash
node -e "require('@hello-pangea/dnd')" && echo "ok"
```

Expected: prints `ok` (types are bundled, no separate `@types/` needed).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @hello-pangea/dnd for drag-and-drop reordering"
```

---

## Task 2: DB Migration — add `sort_order` to `fee_items`

**Files:**
- Create: `supabase/migrations/20260527000000_fee_items_sort_order.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/20260527000000_fee_items_sort_order.sql` with this content:

```sql
ALTER TABLE public.fee_items
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Apply migration locally**

```bash
npx supabase db reset
```

Expected: migration applies without error. All existing rows get `sort_order = 0`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260527000000_fee_items_sort_order.sql
git commit -m "feat: add sort_order column to fee_items"
```

---

## Task 3: Pure reorder helper (TDD)

**Files:**
- Create: `src/lib/finance/reorder.ts`
- Create: `src/lib/finance/reorder.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/finance/reorder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reorderItems } from "@/lib/finance/reorder";

describe("reorderItems", () => {
  const items = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
    { id: "c", name: "Gamma" },
  ];

  it("moves item down", () => {
    const result = reorderItems(items, 0, 2);
    expect(result.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("moves item up", () => {
    const result = reorderItems(items, 2, 0);
    expect(result.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("same index returns same order", () => {
    const result = reorderItems(items, 1, 1);
    expect(result.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate original array", () => {
    reorderItems(items, 0, 2);
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/finance/reorder.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/finance/reorder'`

- [ ] **Step 3: Implement the helper**

Create `src/lib/finance/reorder.ts`:

```ts
/**
 * Reorder an array by moving one element from sourceIndex to destinationIndex.
 * Returns a new array — does not mutate the original.
 */
export function reorderItems<T>(
  items: T[],
  sourceIndex: number,
  destinationIndex: number,
): T[] {
  const result = [...items];
  const [removed] = result.splice(sourceIndex, 1);
  result.splice(destinationIndex, 0, removed);
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/finance/reorder.test.ts
```

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/reorder.ts src/lib/finance/reorder.test.ts
git commit -m "feat: add reorderItems helper with tests"
```

---

## Task 4: Update data layer

**Files:**
- Modify: `src/lib/data/fee-items.ts`

Current file:
```ts
export type FeeItemRow = {
  id: string;
  name: string;
  description: string | null;
  isTuition: boolean;
  isActive: boolean;
};

export async function listFeeItems(): Promise<FeeItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fee_items")
    .select("id, name, description, is_tuition, is_active")
    .order("name", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isTuition: row.is_tuition,
    isActive: row.is_active,
  }));
}
```

- [ ] **Step 1: Update `FeeItemRow` type and `listFeeItems`**

Replace the entire content of `src/lib/data/fee-items.ts` with:

```ts
import { createClient } from "@/lib/supabase/server";

export type FeeItemRow = {
  id: string;
  name: string;
  description: string | null;
  isTuition: boolean;
  isActive: boolean;
  sortOrder: number;
};

export async function listFeeItems(): Promise<FeeItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fee_items")
    .select("id, name, description, is_tuition, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isTuition: row.is_tuition,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }));
}
```

- [ ] **Step 2: Run the dev server briefly to check no TypeScript errors**

```bash
npm run build 2>&1 | head -30
```

Expected: no TypeScript errors related to `fee-items.ts`. (Other unrelated errors are ok.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/fee-items.ts
git commit -m "feat: add sortOrder to FeeItemRow, order fee_items by sort_order"
```

---

## Task 5: Add `reorderFeeItems` server action

**Files:**
- Modify: `src/lib/actions/fee-items.ts`

- [ ] **Step 1: Add `reorderFeeItems` to the actions file**

Open `src/lib/actions/fee-items.ts` and append the following **after** the existing `updateFeeItem` function (keep all existing code unchanged):

```ts
export async function reorderFeeItems(
  orderedIds: string[],
): Promise<ActionState> {
  const auth = await requireAdminAction();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("fee_items")
      .update({ sort_order: i })
      .eq("id", orderedIds[i]);

    if (error) return { ok: false, error: "ไม่สามารถบันทึกลำดับได้" };
  }

  revalidateFeePaths();
  return { ok: true };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no errors in `src/lib/actions/fee-items.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/fee-items.ts
git commit -m "feat: add reorderFeeItems server action"
```

---

## Task 6: Drag & Drop UI in `FeeItemsSection`

**Files:**
- Modify: `src/components/finance/fee-items-section.tsx`

- [ ] **Step 1: Replace the full file with the DnD version**

Replace the entire content of `src/components/finance/fee-items-section.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createFeeItem, reorderFeeItems, updateFeeItem } from "@/lib/actions/fee-items";
import { reorderItems } from "@/lib/finance/reorder";
import type { FeeItemRow } from "@/lib/data/fee-items";

type FeeItemsSectionProps = {
  items: FeeItemRow[];
};

export function FeeItemsSection({ items }: FeeItemsSectionProps) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState<FeeItemRow[]>(items);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editTarget, setEditTarget] = useState<FeeItemRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isTuition, setIsTuition] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Sync local items when server data changes (e.g. after router.refresh())
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  function openCreate() {
    setMode("create");
    setEditTarget(null);
    setName("");
    setDescription("");
    setIsTuition(false);
    setIsActive(true);
    setDialogOpen(true);
  }

  function openEdit(item: FeeItemRow) {
    setMode("edit");
    setEditTarget(item);
    setName(item.name);
    setDescription(item.description ?? "");
    setIsTuition(item.isTuition);
    setIsActive(item.isActive);
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result =
      mode === "create"
        ? await createFeeItem({ name, description, isTuition })
        : await updateFeeItem(editTarget!.id, {
            name,
            description,
            isTuition,
            isActive,
          });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(mode === "create" ? "เพิ่มรายการแล้ว" : "บันทึกรายการแล้ว");
    setDialogOpen(false);
    router.refresh();
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;

    const previous = localItems;
    const reordered = reorderItems(localItems, source.index, destination.index);
    setLocalItems(reordered); // optimistic update

    const outcome = await reorderFeeItems(reordered.map((i) => i.id));
    if (!outcome.ok) {
      toast.error(outcome.error);
      setLocalItems(previous); // revert on failure
    }
  }

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-base">รายการค่าใช้จ่าย</CardTitle>
          <CardDescription>ประเภทค่าธรรมเนียมที่ใช้ในใบแจ้งชำระ — ลากเพื่อเรียงลำดับคอลัมน์</CardDescription>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          เพิ่มรายการ
        </Button>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <DragDropContext onDragEnd={handleDragEnd}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]" />
                <TableHead>ชื่อ</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="w-[100px] text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <Droppable droppableId="fee-items">
              {(provided) => (
                <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                  {localItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        ยังไม่มีรายการ — กดเพิ่มรายการ
                      </TableCell>
                    </TableRow>
                  ) : (
                    localItems.map((item, index) => (
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(drag, snapshot) => (
                          <TableRow
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            className={snapshot.isDragging ? "opacity-80 bg-muted" : undefined}
                          >
                            <TableCell className="w-[40px] px-2">
                              <span
                                {...drag.dragHandleProps}
                                className="flex cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
                              >
                                <GripVertical className="h-4 w-4" />
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>
                              {item.isTuition ? (
                                <Badge variant="secondary">ค่าเทอมหลัก</Badge>
                              ) : (
                                <span className="text-muted-foreground">รายการเพิ่มเติม</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {item.isActive ? (
                                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                                  ใช้งาน
                                </Badge>
                              ) : (
                                <Badge variant="outline">ปิดใช้งาน</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => openEdit(item)}
                              >
                                <Pencil className="mr-1 h-4 w-4" />
                                แก้ไข
                              </Button>
                            </TableCell>
                          </TableRow>
                        )}
                      </Draggable>
                    ))
                  )}
                  {provided.placeholder}
                </TableBody>
              )}
            </Droppable>
          </Table>
        </DragDropContext>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {mode === "create" ? "เพิ่มรายการค่าใช้จ่าย" : "แก้ไขรายการค่าใช้จ่าย"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="fee-item-name">ชื่อรายการ</Label>
                <Input
                  id="fee-item-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น ค่าเทอม"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fee-item-desc">คำอธิบาย (ไม่บังคับ)</Label>
                <Input
                  id="fee-item-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <Label className="flex w-fit cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border accent-primary"
                  checked={isTuition}
                  onChange={(e) => setIsTuition(e.target.checked)}
                />
                เป็นค่าเทอมหลัก
              </Label>
              {mode === "edit" ? (
                <Label className="flex w-fit cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-border accent-primary"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  ใช้งานอยู่
                </Label>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npm run build 2>&1 | head -40
```

Expected: no errors in `fee-items-section.tsx`.

- [ ] **Step 3: Run tests to make sure nothing broke**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/fee-items-section.tsx
git commit -m "feat: add drag-and-drop reordering to fee items list"
```

---

## Task 7: Smoke test in browser

- [ ] **Step 1: Start dev server (if not already running)**

```bash
npm run dev
```

- [ ] **Step 2: Open `/fee-rates` and verify**

1. เปิด `http://localhost:3000/fee-rates`
2. ส่วน "รายการค่าใช้จ่าย" ต้องแสดง icon ⠿ ที่คอลัมน์ซ้ายสุดของทุกแถว
3. ลอง drag แถวขึ้น-ลง — ลำดับเปลี่ยนทันที (optimistic)
4. รีโหลดหน้า — ลำดับใหม่ต้องคงอยู่
5. ตาราง "อัตราค่าธรรมเนียมตามชั้น" ด้านล่างต้องแสดงคอลัมน์ตามลำดับใหม่

- [ ] **Step 3: Final commit (if any minor fixes needed)**

```bash
git add -p
git commit -m "fix: <describe fix>"
```

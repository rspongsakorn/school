# Fee Items Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มความสามารถลบรายการค่าใช้จ่าย (fee items) ทั้งแบบรายการเดียวและ bulk พร้อม confirmation dialog และ error แบบ partial success

**Architecture:** แยก logic การตรวจสอบ eligibility ออกเป็น pure function ที่ทดสอบได้ ส่วน server action ทำ DB query + เรียก pure function + ลบ batch เดียว ส่วน UI เพิ่ม checkbox multi-select, ปุ่มลบต่อแถว, bulk delete button, และ confirmation dialog

**Tech Stack:** Next.js 15 App Router, Supabase, TypeScript, Vitest, shadcn/ui (Dialog, Button, Badge, Table)

---

## File Map

| ไฟล์ | สถานะ | หน้าที่ |
|------|--------|---------|
| `src/lib/finance/fee-item-delete-eligibility.ts` | สร้างใหม่ | Pure functions: ตรวจสอบว่า fee item ลบได้หรือไม่ + reason |
| `src/lib/finance/fee-item-delete-eligibility.test.ts` | สร้างใหม่ | Vitest unit tests สำหรับ pure functions |
| `src/lib/actions/fee-items.ts` | แก้ไข | เพิ่ม `deleteFeeItems` server action + `DeleteFeeItemsResult` type |
| `src/components/finance/fee-items-section.tsx` | แก้ไข | เพิ่ม checkbox, ปุ่มลบ, bulk delete, confirmation dialog, state ใหม่ |

---

## Task 1: Pure function สำหรับ fee item delete eligibility

**Files:**
- Create: `src/lib/finance/fee-item-delete-eligibility.ts`
- Create: `src/lib/finance/fee-item-delete-eligibility.test.ts`

- [ ] **Step 1: เขียน failing tests**

สร้างไฟล์ `src/lib/finance/fee-item-delete-eligibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  feeItemCanDelete,
  feeItemDeleteBlockedReason,
} from "@/lib/finance/fee-item-delete-eligibility";

function ctx(
  overrides: Partial<{ feeRates: number | null; invoiceLines: number | null }> = {},
) {
  return { feeRates: 0, invoiceLines: 0, ...overrides };
}

describe("feeItemCanDelete", () => {
  it("allows delete when no references", () => {
    expect(feeItemCanDelete(ctx())).toBe(true);
  });

  it("blocks delete when referenced by fee_rates", () => {
    expect(feeItemCanDelete(ctx({ feeRates: 1 }))).toBe(false);
  });

  it("blocks delete when referenced by invoice_lines", () => {
    expect(feeItemCanDelete(ctx({ invoiceLines: 1 }))).toBe(false);
  });

  it("blocks delete when referenced by both", () => {
    expect(feeItemCanDelete(ctx({ feeRates: 2, invoiceLines: 3 }))).toBe(false);
  });

  it("treats null counts as zero", () => {
    expect(feeItemCanDelete(ctx({ feeRates: null, invoiceLines: null }))).toBe(true);
  });
});

describe("feeItemDeleteBlockedReason", () => {
  it("returns null when deletable", () => {
    expect(feeItemDeleteBlockedReason(ctx())).toBeNull();
  });

  it("returns fee_rates reason when only fee_rates block", () => {
    expect(feeItemDeleteBlockedReason(ctx({ feeRates: 1 }))).toBe(
      "มีอัตราค่าธรรมเนียมอ้างถึง",
    );
  });

  it("returns invoice_lines reason when only invoice_lines block", () => {
    expect(feeItemDeleteBlockedReason(ctx({ invoiceLines: 1 }))).toBe("มีใบแจ้งชำระอ้างถึง");
  });

  it("returns combined reason when both block", () => {
    expect(feeItemDeleteBlockedReason(ctx({ feeRates: 1, invoiceLines: 1 }))).toBe(
      "มีอัตราค่าธรรมเนียมและใบแจ้งชำระอ้างถึง",
    );
  });
});
```

- [ ] **Step 2: รัน test ให้ fail ก่อน**

```
npx vitest run src/lib/finance/fee-item-delete-eligibility.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/finance/fee-item-delete-eligibility'`

- [ ] **Step 3: เขียน implementation**

สร้างไฟล์ `src/lib/finance/fee-item-delete-eligibility.ts`:

```ts
export type FeeItemReferenceCounts = {
  feeRates: number | null;
  invoiceLines: number | null;
};

export function feeItemCanDelete(counts: FeeItemReferenceCounts): boolean {
  return (counts.feeRates ?? 0) + (counts.invoiceLines ?? 0) === 0;
}

export function feeItemDeleteBlockedReason(counts: FeeItemReferenceCounts): string | null {
  if (feeItemCanDelete(counts)) return null;
  const inRates = (counts.feeRates ?? 0) > 0;
  const inInvoices = (counts.invoiceLines ?? 0) > 0;
  if (inRates && inInvoices) return "มีอัตราค่าธรรมเนียมและใบแจ้งชำระอ้างถึง";
  if (inRates) return "มีอัตราค่าธรรมเนียมอ้างถึง";
  return "มีใบแจ้งชำระอ้างถึง";
}
```

- [ ] **Step 4: รัน test ให้ pass**

```
npx vitest run src/lib/finance/fee-item-delete-eligibility.test.ts
```

Expected: PASS — 9 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/fee-item-delete-eligibility.ts src/lib/finance/fee-item-delete-eligibility.test.ts
git commit -m "feat: fee item delete eligibility pure functions"
```

---

## Task 2: `deleteFeeItems` server action

**Files:**
- Modify: `src/lib/actions/fee-items.ts`

- [ ] **Step 1: เพิ่ม `DeleteFeeItemsResult` type และ `deleteFeeItems` function**

เปิด `src/lib/actions/fee-items.ts` แล้วเพิ่ม import และ function ต่อท้ายไฟล์:

เพิ่ม import บนสุดของไฟล์ (ต่อจาก import ที่มีอยู่แล้ว):
```ts
import { feeItemDeleteBlockedReason } from "@/lib/finance/fee-item-delete-eligibility";
```

เพิ่ม type และ function ต่อท้ายไฟล์ (หลัง `updateFeeItem`):
```ts
export type DeleteFeeItemsResult = {
  ok: boolean;
  deletedCount: number;
  blocked: { id: string; name: string; reason: string }[];
};

export async function deleteFeeItems(ids: string[]): Promise<DeleteFeeItemsResult> {
  const auth = await requireAdminAction();
  if (!auth.ok) return { ok: false, deletedCount: 0, blocked: [] };

  if (ids.length === 0) return { ok: true, deletedCount: 0, blocked: [] };

  const supabase = await createClient();

  // Pre-check: ดูว่า id ไหนถูกอ้างอิงใน fee_rates หรือ invoice_lines
  const [{ data: rateRefs }, { data: invoiceRefs }] = await Promise.all([
    supabase.from("fee_rates").select("fee_item_id").in("fee_item_id", ids),
    supabase.from("invoice_lines").select("fee_item_id").in("fee_item_id", ids),
  ]);

  const inRates = new Set((rateRefs ?? []).map((r) => r.fee_item_id));
  const inInvoices = new Set((invoiceRefs ?? []).map((r) => r.fee_item_id));

  const blockedIds = ids.filter((id) => inRates.has(id) || inInvoices.has(id));
  const canDelete = ids.filter((id) => !inRates.has(id) && !inInvoices.has(id));

  let blocked: { id: string; name: string; reason: string }[] = [];
  if (blockedIds.length > 0) {
    const { data: blockedItems } = await supabase
      .from("fee_items")
      .select("id, name")
      .in("id", blockedIds);

    blocked = (blockedItems ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      reason: feeItemDeleteBlockedReason({
        feeRates: inRates.has(item.id) ? 1 : 0,
        invoiceLines: inInvoices.has(item.id) ? 1 : 0,
      })!,
    }));
  }

  if (canDelete.length > 0) {
    const { error } = await supabase.from("fee_items").delete().in("id", canDelete);
    if (error) return { ok: false, deletedCount: 0, blocked };
    revalidateFeePaths();
  }

  return { ok: true, deletedCount: canDelete.length, blocked };
}
```

- [ ] **Step 2: ตรวจ TypeScript**

```
npx tsc --noEmit
```

Expected: ไม่มี error

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/fee-items.ts
git commit -m "feat: deleteFeeItems server action with pre-check"
```

---

## Task 3: อัปเดต UI ใน `FeeItemsSection`

**Files:**
- Modify: `src/components/finance/fee-items-section.tsx`

- [ ] **Step 1: แทนที่เนื้อหาทั้งหมดของไฟล์**

แทนที่ `src/components/finance/fee-items-section.tsx` ด้วยโค้ดต่อไปนี้ทั้งหมด:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  createFeeItem,
  updateFeeItem,
  deleteFeeItems,
} from "@/lib/actions/fee-items";
import type { FeeItemRow } from "@/lib/data/fee-items";

type FeeItemsSectionProps = {
  items: FeeItemRow[];
};

export function FeeItemsSection({ items }: FeeItemsSectionProps) {
  const router = useRouter();

  // Edit/Create state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editTarget, setEditTarget] = useState<FeeItemRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isTuition, setIsTuition] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Delete state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<FeeItemRow[] | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // --- Edit/Create handlers ---

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

  // --- Delete handlers ---

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }

  function openDeleteSingle(item: FeeItemRow) {
    setDeleteTarget([item]);
    setDeleteDialogOpen(true);
  }

  function openDeleteBulk() {
    setDeleteTarget(items.filter((i) => selectedIds.has(i.id)));
    setDeleteDialogOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const ids = deleteTarget.map((i) => i.id);
    const result = await deleteFeeItems(ids);
    setDeleting(false);

    if (!result.ok) {
      toast.error("เกิดข้อผิดพลาด ไม่สามารถลบรายการได้");
      return;
    }

    if (result.deletedCount > 0) {
      toast.success(`ลบ ${result.deletedCount} รายการแล้ว`);
    }

    for (const b of result.blocked) {
      toast.error(`${b.name} — ${b.reason}`);
    }

    setDeleteDialogOpen(false);
    setSelectedIds(new Set());
    router.refresh();
  }

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < items.length;

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-base">รายการค่าใช้จ่าย</CardTitle>
          <CardDescription>ประเภทค่าธรรมเนียมที่ใช้ในใบแจ้งชำระ</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={openDeleteBulk}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              ลบที่เลือก ({selectedIds.size})
            </Button>
          )}
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            เพิ่มรายการ
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[48px] pl-4">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border accent-primary"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>ชื่อ</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="w-[180px] text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-6 text-center text-muted-foreground"
                >
                  ยังไม่มีรายการ — กดเพิ่มรายการ
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-4">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-border accent-primary"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
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
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(item)}
                      >
                        <Pencil className="mr-1 h-4 w-4" />
                        แก้ไข
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openDeleteSingle(item)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        ลบ
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Edit / Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {mode === "create"
                  ? "เพิ่มรายการค่าใช้จ่าย"
                  : "แก้ไขรายการค่าใช้จ่าย"}
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยืนยันการลบ</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">
            {deleteTarget?.length === 1
              ? `แน่ใจว่าต้องการลบ "${deleteTarget[0].name}"?`
              : `แน่ใจว่าต้องการลบ ${deleteTarget?.length ?? 0} รายการที่เลือก?`}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              ยกเลิก
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "กำลังลบ..." : "ลบ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
```

- [ ] **Step 2: ตรวจ TypeScript**

```
npx tsc --noEmit
```

Expected: ไม่มี error

- [ ] **Step 3: รัน test ทั้งหมด**

```
npx vitest run
```

Expected: PASS ทั้งหมด (รวม test ที่เขียนใน Task 1)

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/fee-items-section.tsx
git commit -m "feat: delete fee items with bulk select and confirmation"
```

---

## Task 4: ทดสอบใน browser

- [ ] **Step 1: รัน dev server**

```
npm run dev
```

เปิด `http://localhost:3000/fee-rates`

- [ ] **Step 2: ทดสอบ single delete**

1. คลิกปุ่ม **ลบ** ในแถวรายการที่ยังไม่มีข้อมูลอ้างถึง
2. Dialog ยืนยันปรากฏ — คลิก **ลบ**
3. ตรวจว่า toast `"ลบ 1 รายการแล้ว"` ปรากฏ และรายการหายไปจากตาราง

- [ ] **Step 3: ทดสอบ delete ที่ติด FK**

1. คลิกปุ่ม **ลบ** ในแถวรายการที่มีอัตราค่าธรรมเนียมหรือใบแจ้งชำระอ้างถึง
2. Dialog ยืนยันปรากฏ — คลิก **ลบ**
3. ตรวจว่า toast error ปรากฏพร้อม reason ภาษาไทย และรายการยังอยู่ในตาราง

- [ ] **Step 4: ทดสอบ bulk delete**

1. Tick checkbox หลายแถว
2. ปุ่ม **"ลบที่เลือก (N)"** ปรากฏใน header
3. คลิก — Dialog ยืนยันแสดง "แน่ใจว่าต้องการลบ N รายการที่เลือก?"
4. คลิก **ลบ** — รายการที่ลบได้หายไป, รายการที่ติดแสดง error toast

- [ ] **Step 5: ทดสอบ select all**

1. Tick checkbox ใน header → รายการทุกแถวถูกเลือก
2. Tick อีกครั้ง → ยกเลิกทั้งหมด
3. Tick บางแถว → checkbox ใน header แสดง indeterminate state

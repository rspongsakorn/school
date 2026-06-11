"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { GripVertical, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
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
  deleteFeeItems,
  reorderFeeItems,
  updateFeeItem,
} from "@/lib/actions/fee-items";
import { reorderItems } from "@/lib/finance/reorder";
import type { FeeItemRow } from "@/lib/data/fee-items";

type FeeItemsSectionProps = {
  items: FeeItemRow[];
  invoiceTypeId: string;
  lockedItemIds: Set<string>;
};

export function FeeItemsSection({ items, invoiceTypeId, lockedItemIds }: FeeItemsSectionProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [localItems, setLocalItems] = useState<FeeItemRow[]>(items);

  function refreshLists() {
    queryClient.invalidateQueries({ queryKey: ["fee-items", invoiceTypeId] });
    queryClient.invalidateQueries({ queryKey: ["fee-rate-matrix"] });
    router.refresh();
  }

  // Edit/Create state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editTarget, setEditTarget] = useState<FeeItemRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isTuition, setIsTuition] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [hasReimbursableVariant, setHasReimbursableVariant] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Delete state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<FeeItemRow[] | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sync local items when server data changes (e.g. after router.refresh())
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  // --- Edit/Create handlers ---

  function openCreate() {
    setMode("create");
    setEditTarget(null);
    setName("");
    setDescription("");
    setIsTuition(false);
    setIsActive(true);
    setHasReimbursableVariant(false);
    setDialogOpen(true);
  }

  function openEdit(item: FeeItemRow) {
    setMode("edit");
    setEditTarget(item);
    setName(item.name);
    setDescription(item.description ?? "");
    setIsTuition(item.isTuition);
    setIsActive(item.isActive);
    setHasReimbursableVariant(item.hasReimbursableVariant);
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result =
      mode === "create"
        ? await createFeeItem({ name, description, isTuition, hasReimbursableVariant, invoiceTypeId })
        : await updateFeeItem(editTarget!.id, {
            name,
            description,
            isTuition,
            isActive,
            hasReimbursableVariant,
          });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(mode === "create" ? "เพิ่มรายการแล้ว" : "บันทึกรายการแล้ว");
    setDialogOpen(false);
    refreshLists();
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
    if (selectedIds.size === localItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(localItems.map((i) => i.id)));
    }
  }

  function openDeleteSingle(item: FeeItemRow) {
    setDeleteTarget([item]);
    setDeleteDialogOpen(true);
  }

  function openDeleteBulk() {
    setDeleteTarget(localItems.filter((i) => selectedIds.has(i.id)));
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
      setDeleteDialogOpen(false);
      return;
    }

    if (result.deletedCount > 0) {
      toast.success(`ลบ ${result.deletedCount} รายการแล้ว`);
      // Optimistic update: ลบออกจาก localItems ทันที ไม่รอ router.refresh()
      const blockedIdSet = new Set(result.blocked.map((b) => b.id));
      const deletedIds = new Set(ids.filter((id) => !blockedIdSet.has(id)));
      setLocalItems((prev) => prev.filter((item) => !deletedIds.has(item.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });
    }

    for (const b of result.blocked) {
      toast.error(`${b.name} — ${b.reason}`);
    }

    setDeleteDialogOpen(false);
    refreshLists();
  }

  // --- DnD handler ---

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

  const allSelected = localItems.length > 0 && selectedIds.size === localItems.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < localItems.length;
  const editLocked = editTarget ? lockedItemIds.has(editTarget.id) : false;

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-base">รายการค่าใช้จ่าย</CardTitle>
          <CardDescription>ประเภทค่าธรรมเนียมที่ใช้ในใบแจ้งชำระ — ลากเพื่อเรียงลำดับคอลัมน์</CardDescription>
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
        <DragDropContext onDragEnd={handleDragEnd}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]" />
                <TableHead className="w-[48px] pl-4">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-border accent-primary"
                    checked={allSelected}
                    aria-label="เลือกทั้งหมด"
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>ชื่อ</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="w-[180px] text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <Droppable droppableId="fee-items">
              {(provided) => (
                <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                  {localItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
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
                            <TableCell className="pl-4">
                              <input
                                type="checkbox"
                                className="size-4 rounded border-border accent-primary"
                                checked={selectedIds.has(item.id)}
                                aria-label={`เลือก ${item.name}`}
                                onChange={() => toggleSelect(item.id)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {item.isActive ? (
                                  <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                                    ใช้งาน
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">ปิดใช้งาน</Badge>
                                )}
                                {lockedItemIds.has(item.id) ? (
                                  <Badge variant="outline" className="gap-1 text-muted-foreground">
                                    <Lock className="h-3 w-3" />
                                    ออกบิลแล้ว
                                  </Badge>
                                ) : null}
                              </div>
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
              {editLocked ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  ออกใบแจ้งชำระแล้ว — แก้ไขได้เฉพาะสถานะใช้งาน
                </p>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="fee-item-name">ชื่อรายการ</Label>
                <Input
                  id="fee-item-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น ค่าเทอม"
                  disabled={editLocked}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fee-item-desc">คำอธิบาย (ไม่บังคับ)</Label>
                <Input
                  id="fee-item-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={editLocked}
                />
              </div>
              <Label className="flex w-fit items-center gap-3 has-[:disabled]:cursor-not-allowed has-[:enabled]:cursor-pointer">
                <input
                  type="checkbox"
                  className="size-4 rounded border-border accent-primary"
                  checked={hasReimbursableVariant}
                  onChange={(e) => setHasReimbursableVariant(e.target.checked)}
                  disabled={editLocked}
                />
                มีราคาเบิกได้แยก
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
                disabled={submitting}
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
              disabled={deleting}
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

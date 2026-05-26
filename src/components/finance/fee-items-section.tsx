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
      setDeleteDialogOpen(false);
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
                  aria-label="เลือกทั้งหมด"
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
                      aria-label={`เลือก ${item.name}`}
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

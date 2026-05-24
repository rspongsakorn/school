"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
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
import { createReceiptType, updateReceiptType } from "@/lib/actions/receipt-types";
import type { ReceiptTypeRow } from "@/lib/data/receipt-types";

type ReceiptTypesPanelProps = {
  types: ReceiptTypeRow[];
};

export function ReceiptTypesPanel({ types }: ReceiptTypesPanelProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editTarget, setEditTarget] = useState<ReceiptTypeRow | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  function openCreate() {
    setMode("create");
    setEditTarget(null);
    setCode("");
    setName("");
    setDescription("");
    setIsActive(true);
    setDialogOpen(true);
  }

  function openEdit(row: ReceiptTypeRow) {
    setMode("edit");
    setEditTarget(row);
    setCode(row.code);
    setName(row.name);
    setDescription(row.description ?? "");
    setIsActive(row.isActive);
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result =
      mode === "create"
        ? await createReceiptType({ code, name, description })
        : await updateReceiptType(editTarget!.id, { code, name, description, isActive });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(mode === "create" ? "เพิ่มประเภทใบเสร็จแล้ว" : "บันทึกแล้ว");
    setDialogOpen(false);
    router.refresh();
  }

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="space-y-1">
          <CardTitle>ประเภทใบเสร็จ</CardTitle>
          <CardDescription>ใช้จัดประเภทรายรับในใบเสร็จ</CardDescription>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          เพิ่มประเภท
        </Button>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รหัส</TableHead>
              <TableHead>ชื่อ</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="w-[100px] text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono tabular-nums">{row.code}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>
                  {row.isActive ? (
                    <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                      ใช้งาน
                    </Badge>
                  ) : (
                    <Badge variant="outline">ปิด</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>
                    <Pencil className="mr-1 h-4 w-4" />
                    แก้ไข
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {mode === "create" ? "เพิ่มประเภทใบเสร็จ" : "แก้ไขประเภทใบเสร็จ"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="rt-code">รหัส</Label>
                <Input id="rt-code" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rt-name">ชื่อ</Label>
                <Input id="rt-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rt-desc">คำอธิบาย</Label>
                <Input
                  id="rt-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
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

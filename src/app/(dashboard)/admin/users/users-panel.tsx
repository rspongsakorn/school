"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRow } from "@/lib/data/users";
import {
  createUserAction,
  updateUserAction,
  resetPasswordAction,
  toggleActiveAction,
  deleteUserAction,
} from "@/lib/actions/users";

const ROLE_LABELS: Record<UserRow["role"], string> = {
  admin: "Admin",
  finance: "Finance",
  teacher: "Teacher",
};

const ROLE_BADGE_CLASSES: Record<UserRow["role"], string> = {
  admin: "bg-blue-50 text-blue-700 hover:bg-blue-50",
  finance: "bg-amber-50 text-amber-700 hover:bg-amber-50",
  teacher: "bg-gray-100 text-gray-700 hover:bg-gray-100",
};

const roleItems: { value: UserRow["role"]; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "finance", label: "Finance" },
  { value: "teacher", label: "Teacher" },
];

type DialogState =
  | { type: "none" }
  | { type: "create" }
  | { type: "edit"; user: UserRow }
  | { type: "resetPassword"; user: UserRow }
  | { type: "delete"; user: UserRow };

export function UsersPanel({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>({ type: "none" });
  const [submitting, setSubmitting] = useState(false);

  // Create form
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<UserRow["role"]>("teacher");
  const [createPassword, setCreatePassword] = useState("");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<UserRow["role"]>("teacher");

  // Reset password form
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function closeDialog() {
    setDialog({ type: "none" });
  }

  function openCreate() {
    setCreateEmail("");
    setCreateName("");
    setCreateRole("teacher");
    setCreatePassword("");
    setDialog({ type: "create" });
  }

  function openEdit(user: UserRow) {
    setEditName(user.displayName);
    setEditRole(user.role);
    setDialog({ type: "edit", user });
  }

  function openResetPassword(user: UserRow) {
    setNewPassword("");
    setConfirmPassword("");
    setDialog({ type: "resetPassword", user });
  }

  async function handleCreate() {
    if (!createEmail.trim() || !createPassword) return;
    setSubmitting(true);
    const result = await createUserAction({
      email: createEmail,
      displayName: createName,
      role: createRole,
      password: createPassword,
    });
    setSubmitting(false);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("สร้างบัญชีผู้ใช้แล้ว");
    closeDialog();
    router.refresh();
  }

  async function handleEdit() {
    if (dialog.type !== "edit") return;
    setSubmitting(true);
    const result = await updateUserAction({
      userId: dialog.user.id,
      displayName: editName,
      role: editRole,
    });
    setSubmitting(false);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("แก้ไขข้อมูลแล้ว");
    closeDialog();
    router.refresh();
  }

  async function handleResetPassword() {
    if (dialog.type !== "resetPassword") return;
    if (newPassword !== confirmPassword) {
      toast.error("รหัสผ่านไม่ตรงกัน");
      return;
    }
    if (!newPassword) return;
    setSubmitting(true);
    const result = await resetPasswordAction({
      userId: dialog.user.id,
      password: newPassword,
    });
    setSubmitting(false);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("เปลี่ยนรหัสผ่านแล้ว");
    closeDialog();
    router.refresh();
  }

  async function handleToggleActive(user: UserRow) {
    const result = await toggleActiveAction({
      userId: user.id,
      isActive: !user.isActive,
    });
    if (!result.ok) { toast.error(result.error); return; }
    toast.success(user.isActive ? "ปิดใช้งานแล้ว" : "เปิดใช้งานแล้ว");
    router.refresh();
  }

  async function handleDelete() {
    if (dialog.type !== "delete") return;
    setSubmitting(true);
    const result = await deleteUserAction({ userId: dialog.user.id });
    setSubmitting(false);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("ลบบัญชีแล้ว");
    closeDialog();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{users.length} บัญชี</p>
        <Button type="button" onClick={openCreate}>
          + เพิ่มผู้ใช้
        </Button>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อ</TableHead>
              <TableHead>อีเมล</TableHead>
              <TableHead>บทบาท</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="text-right">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  ไม่พบผู้ใช้งาน
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <TableRow key={u.id} className={!u.isActive ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">{u.displayName || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge className={ROLE_BADGE_CLASSES[u.role]}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                          ใช้งานได้
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-destructive border-destructive/30">
                          ปิดใช้งาน
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(u)}
                        >
                          แก้ไข
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openResetPassword(u)}
                        >
                          รหัสผ่าน
                        </Button>
                        {!isSelf && u.isActive && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => handleToggleActive(u)}
                          >
                            ปิด
                          </Button>
                        )}
                        {!isSelf && !u.isActive && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-emerald-700"
                              onClick={() => handleToggleActive(u)}
                            >
                              เปิด
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-destructive"
                              onClick={() => setDialog({ type: "delete", user: u })}
                            >
                              ลบ
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Create Dialog ── */}
      <Dialog open={dialog.type === "create"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มผู้ใช้งานใหม่</DialogTitle>
            <DialogDescription>กรอกข้อมูลและรหัสผ่านชั่วคราว</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="c-email">อีเมล</Label>
              <Input
                id="c-email"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="teacher@school.ac.th"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-name">ชื่อที่แสดง</Label>
              <Input
                id="c-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="นางสาวมาลี รักดี"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>บทบาท</Label>
              <Select
                value={createRole}
                onValueChange={(v) => setCreateRole(v as UserRow["role"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-password">รหัสผ่านชั่วคราว</Label>
              <Input
                id="c-password"
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">แจ้งให้ผู้ใช้เปลี่ยนหลัง login ครั้งแรก</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={submitting || !createEmail.trim() || !createPassword}
            >
              {submitting ? "กำลังสร้าง..." : "สร้างบัญชี"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={dialog.type === "edit"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูลผู้ใช้</DialogTitle>
            {dialog.type === "edit" && (
              <DialogDescription>{dialog.user.email}</DialogDescription>
            )}
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="e-name">ชื่อที่แสดง</Label>
              <Input
                id="e-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>บทบาท</Label>
              <Select
                value={editRole}
                onValueChange={(v) => setEditRole(v as UserRow["role"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              ยกเลิก
            </Button>
            <Button type="button" onClick={handleEdit} disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ── */}
      <Dialog open={dialog.type === "resetPassword"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ตั้งรหัสผ่านใหม่</DialogTitle>
            {dialog.type === "resetPassword" && (
              <DialogDescription>{dialog.user.displayName || dialog.user.email}</DialogDescription>
            )}
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="r-password">รหัสผ่านใหม่</Label>
              <Input
                id="r-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-confirm">ยืนยันรหัสผ่าน</Label>
              <Input
                id="r-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              onClick={handleResetPassword}
              disabled={submitting || !newPassword}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {submitting ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete AlertDialog ── */}
      <AlertDialog
        open={dialog.type === "delete"}
        onOpenChange={(o) => !o && closeDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">ลบบัญชีผู้ใช้</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog.type === "delete" && (
                <>
                  ต้องการลบบัญชี <strong>{dialog.user.displayName}</strong> ({dialog.user.email}){" "}
                  ออกจากระบบถาวรหรือไม่? การลบนี้ไม่สามารถกู้คืนได้
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting ? "กำลังลบ..." : "ลบถาวร"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

# Design: ลบรายการค่าใช้จ่าย (Fee Items Delete)

**Date:** 2026-05-27  
**Scope:** หน้าตั้งค่าค่าธรรมเนียม (`/fee-rates`) — เพิ่มความสามารถลบรายการค่าใช้จ่ายแบบรายการเดียวและแบบ bulk

---

## ภาพรวม

เพิ่มปุ่มลบในตาราง `FeeItemsSection` พร้อม multi-select สำหรับ bulk delete โดยมี confirmation dialog ก่อนดำเนินการ และแสดง error เฉพาะรายการที่ลบไม่ได้ (partial success)

---

## UI — `FeeItemsSection`

### ตาราง
- เพิ่มคอลัมน์ checkbox ซ้ายสุด มี "select all" ใน `TableHeader`
- เพิ่มปุ่ม **ลบ** (ไอคอน `Trash2`, `variant="outline"`, `size="sm"`) ในแต่ละแถว ข้างๆ ปุ่มแก้ไข

### Card Header
- เมื่อมีรายการถูกเลือก (`selectedIds.size > 0`) ปุ่ม **"ลบที่เลือก (N)"** ปรากฏระหว่างปุ่มเพิ่มรายการกับหัวการ์ด
- ปุ่ม bulk delete ใช้ `variant="destructive"`, `size="sm"`

### Confirmation Dialog
- Dialog เดียวใช้ทั้ง single และ bulk (`deleteDialogOpen` / `deleteTarget`)
- **Single:** "แน่ใจว่าต้องการลบ _[ชื่อ]_?"
- **Bulk:** "แน่ใจว่าต้องการลบ N รายการที่เลือก?"
- ปุ่ม: ยกเลิก / **ลบ** (`variant="destructive"`)

### State ที่เพิ่มใหม่
```ts
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [deleteTarget, setDeleteTarget] = useState<FeeItemRow[] | null>(null);
const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
const [deleting, setDeleting] = useState(false);
```

### Flow
1. กดลบแถวเดียว → `setDeleteTarget([item])` → `setDeleteDialogOpen(true)`
2. กดลบที่เลือก → `setDeleteTarget(items ที่ selected)` → `setDeleteDialogOpen(true)`
3. ยืนยันใน dialog → เรียก `deleteFeeItems(ids)` → แสดง toast → `router.refresh()` → clear selection

---

## Action Layer — `src/lib/actions/fee-items.ts`

เพิ่ม function `deleteFeeItems`:

```ts
export async function deleteFeeItems(ids: string[]): Promise<DeleteFeeItemsResult>
```

### Return type
```ts
type DeleteFeeItemsResult = {
  ok: boolean;
  deletedCount: number;
  blocked: { id: string; name: string; reason: string }[];
};
```

### Algorithm
1. **Pre-check** — query `fee_rates` และ `invoice_lines` ดูว่า id ไหนถูกอ้างถึง
2. **แยก** ids เป็น `canDelete` และ `blocked`
3. **ลบ** `canDelete` ด้วย `.in("id", canDelete)` batch เดียว
4. **Return** `{ ok: true, deletedCount, blocked }` พร้อม reason ภาษาไทย:
   - `"มีอัตราค่าธรรมเนียมอ้างถึง"` — ถ้าติดที่ `fee_rates`
   - `"มีใบแจ้งชำระอ้างถึง"` — ถ้าติดที่ `invoice_lines`
   - `"มีอัตราค่าธรรมเนียมและใบแจ้งชำระอ้างถึง"` — ถ้าติดทั้งคู่

### Toast หลังดำเนินการ
- มีรายการที่ลบสำเร็จ → `toast.success("ลบ N รายการแล้ว")`
- มีรายการที่ลบไม่ได้ → `toast.error("[ชื่อ] — [reason]")` แยกต่อรายการ

---

## ไฟล์ที่ต้องแก้ไข

| ไฟล์ | การเปลี่ยนแปลง |
|------|----------------|
| `src/components/finance/fee-items-section.tsx` | เพิ่ม checkbox, ปุ่มลบ, bulk delete button, confirmation dialog, state ใหม่ |
| `src/lib/actions/fee-items.ts` | เพิ่ม `deleteFeeItems` action |

ไม่มีการเปลี่ยนแปลง DB schema หรือ data layer

---

## ข้อควรระวัง

- `fee_items` มี FK `ON DELETE RESTRICT` จากทั้ง `fee_rates` และ `invoice_lines` — ต้อง pre-check เสมอก่อนลบ
- หลัง delete ต้อง `revalidatePath("/fee-rates")` และ `revalidatePath("/invoices")` เช่นเดิม
- Clear `selectedIds` หลังการลบทุกครั้ง (ทั้ง success และ partial)

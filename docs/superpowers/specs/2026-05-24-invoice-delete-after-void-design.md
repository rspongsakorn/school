# Design Spec: ลบใบแจ้งชำระหลังยกเลิกใบเสร็จครบ

**Date:** 2026-05-24  
**Status:** Approved  
**Parent:** [2026-05-24-finance-pages-design.md](./2026-05-24-finance-pages-design.md)  
**Scope:** ปรับกฎลบใบแจ้งชำระบน `/invoices` ให้ลบได้เมื่อยอดค้างเต็มและไม่มีใบเสร็จ active ค้างอยู่

---

## 1. Problem

ปัจจุบันระบบอนุญาตลบใบแจ้งเมื่อ `paid_amount = 0` เท่านั้น แต่ในทางปฏิบัติ:

1. เมื่อยกเลิกใบเสร็จ ระบบ rollback `paid_amount` แล้ว แต่ยังคงแถว `payment_allocations` ที่อ้างอิงใบแจ้ง
2. FK `payment_allocations.invoice_id` ใช้ `ON DELETE RESTRICT` — การลบใบแจ้งล้มเหลวแม้ยอดค้างกลับมาเต็มแล้ว
3. UI ซ่อนปุ่มลบเมื่อเคยชำระ (แม้ void แล้ว) ถ้า `paid_amount` ไม่เป็นศูนย์จาก edge case

ผู้ใช้ต้องการลบใบแจ้งที่ **ยอดค้างเต็ม** ได้ หลัง **ยกเลิกใบเสร็จที่เกี่ยวข้องทั้งหมด** โดย **เก็บประวัติ payment/receipt ที่ void แล้ว** ไว้ audit

---

## 2. Decisions (brainstorming)

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| ชำระบางส่วน | ลบไม่ได้ — ต้องยกเลิกใบเสร็จทั้งหมดก่อนจน `paid_amount = 0` |
| ยอดค้างเต็มหลัง void | ลบได้ |
| ใบเสร็จ active ค้าง | ลบไม่ได้ — แจ้งให้ยกเลิกใบเสร็จก่อน |
| ประวัติหลังลบใบแจ้ง | เก็บ `payments` (voided), `receipts`, `payment_voids` — ลบเฉพาะ `payment_allocations` ของ voided payment ก่อนลบใบแจ้ง |
| DB migration | ไม่จำเป็น — จัดการใน server action |
| แนวทาง | ตรวจ active allocation + ลบ voided allocations ก่อนลบ invoice (แนวทาง 1) |

---

## 3. Business Rules

### ลบได้ (`deletable = true`)

ทุกข้อต้องเป็นจริง:

- `paid_amount <= 0` (เทียบเท่ายอดค้าง = `total_amount` ภายใน tolerance สตางค์)
- ไม่มี `payment_allocations` ที่ชี้ไป `payments.status = 'active'`

### ลบไม่ได้

| สถานะ | ข้อความ (ไทย) |
|--------|----------------|
| `paid_amount > 0` | ต้องยกเลิกใบเสร็จทั้งหมดก่อน |
| มี allocation จาก payment `active` | ยกเลิกใบเสร็จที่เกี่ยวข้องทั้งหมดก่อน |

### ลำดับการลบ (server)

สำหรับแต่ละใบที่ผ่านเงื่อนไข:

1. `DELETE payment_allocations` WHERE `invoice_id = ?` AND payment `status = 'voided'`
2. `DELETE student_invoices` WHERE `id = ?` (`invoice_lines` CASCADE)

ไม่ลบ `payments`, `receipts`, `payment_voids`

---

## 4. Technical Design

### 4.1 Eligibility helper

**File:** `src/lib/finance/invoice-delete-eligibility.ts`

```ts
type InvoiceDeleteContext = {
  paidAmount: number;
  totalAmount: number;
  hasActivePaymentAllocation: boolean;
};

function canDeleteInvoice(ctx: InvoiceDeleteContext): boolean;
function invoiceDeleteBlockedReason(ctx: InvoiceDeleteContext): string | null;
```

- ใช้ `round2` / tolerance `0.001` เมื่อเทียบยอด
- Unit tests ครอบคลุม: never paid, void-only history, active payment, partial paid

### 4.2 Data layer

**File:** `src/lib/data/invoices.ts` (หรือ `invoice-delete.ts` ถ้าแยก)

- `getInvoiceDeleteContext(invoiceIds: string[])` → map `id → { paidAmount, totalAmount, hasActivePaymentAllocation }`
- Query allocations join payments: `hasActive = EXISTS (allocation WHERE payment.status = 'active')`

### 4.3 Server action

**File:** `src/lib/actions/invoices.ts` — `deleteInvoices`

1. โหลด context สำหรับ `invoiceIds`
2. แยก `deletableIds` / `skipped` พร้อมเหตุผล
3. ต่อ invoice: ลบ voided allocations → ลบ invoice
4. Transaction ต่อใบ (หรือ batch ถ้า Supabase รองรับ) — ถ้าขั้นใดล้มเหลว rollback ใบนั้น
5. `revalidatePath` finance routes เหมือนเดิม

### 4.4 UI

**File:** `src/components/finance/invoices-panel.tsx`

- ใช้ `canDeleteInvoice` / `invoiceDeleteBlockedReason` แทน `paidAmount === 0` อย่างเดียว
- Checkbox + ปุ่มลบแสดงเมื่อ `deletable`
- Dialog ยืนยัน: ถ้ามี void history แจ้งว่า *"ประวัติใบเสร็จที่ยกเลิกแล้วจะยังอยู่ในระบบ"*
- Bulk delete: ข้ามใบที่ลบไม่ได้ พร้อมสรุปใน toast

---

## 5. Error Handling

| กรณี | พฤติกรรม |
|------|----------|
| ไม่พบใบ | `skipped` / error ตาม bulk vs single |
| มี active payment | ไม่ลบ, แจ้งเหตุผล |
| DB RESTRICT อื่น | `"ไม่สามารถลบใบแจ้งชำระได้"` + log |
| ลบบางส่วนสำเร็จ (bulk) | toast: ลบแล้ว N ใบ (ข้าม M ใบ) |

---

## 6. Testing

### Unit

- `invoice-delete-eligibility.test.ts` — ทุกกฎใน §3

### Manual

1. สร้างใบแจ้ง → ชำระ → void → ลบใบแจ้งสำเร็จ; payment voided ยังอยู่ใน DB
2. ชำระบางส่วน (ไม่ void ครบ) → ลบไม่ได้ + ข้อความถูกต้อง
3. มีใบเสร็จ active → ลบไม่ได้
4. Bulk: เลือกหลายใบผสม deletable / blocked → สรุปถูกต้อง

---

## 7. Out of Scope

- ลบ `payments` / `receipts` ที่ void แล้วพร้อมใบแจ้ง
- Migration เปลี่ยน FK เป็น CASCADE
- ลบใบที่ชำระบางส่วนโดยไม่ void ครบ

---

## 8. Files to Touch (implementation hint)

| File | Change |
|------|--------|
| `src/lib/finance/invoice-delete-eligibility.ts` | ขยาย logic + reason |
| `src/lib/finance/invoice-delete-eligibility.test.ts` | tests |
| `src/lib/data/invoices.ts` | `getInvoiceDeleteContext` |
| `src/lib/actions/invoices.ts` | `deleteInvoices` ลบ voided allocations ก่อน |
| `src/components/finance/invoices-panel.tsx` | eligibility + dialog copy |

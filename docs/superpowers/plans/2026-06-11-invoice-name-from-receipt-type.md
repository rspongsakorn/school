# Invoice Name from Receipt Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ลบคอลัมน์ `invoice_name` ออกจาก `student_invoices` และให้ชื่อใบแจ้ง (`invoiceName`) ทุกที่ดึงมาจาก `receipt_types.name` แทน

**Architecture:** เปลี่ยนทุก query ที่เคย select `invoice_name` ให้ join `receipt_types ( name )` แล้ว map เป็น field `invoiceName` ชื่อเดิม — consumer (component, snapshot) จึงไม่ต้องเปลี่ยน interface แล้ว drop คอลัมน์ใน DB ด้วย migration

**Tech Stack:** Next.js, TypeScript, Supabase (PostgREST), Vitest

**Verification note:** ฟังก์ชัน query/data เหล่านี้ยิงตรงไป Supabase ไม่มี unit test เดิมครอบ การตรวจสอบหลักคือ `npx tsc --noEmit` (จับทุกจุดที่ยังอ้าง `invoice_name` ค้าง) + `npm run lint` แต่ละ Task จบด้วยการรัน gate นี้แล้ว commit

---

### Task 1: Migration — drop `invoice_name`, บังคับ `receipt_type_id` NOT NULL

**Files:**
- Create: `supabase/migrations/20260611000200_drop_invoice_name.sql`

- [ ] **Step 1: เขียนไฟล์ migration**

สร้าง `supabase/migrations/20260611000200_drop_invoice_name.sql`:

```sql
-- Every invoice now derives its display name from its receipt type.
-- Enforce that the link is always present, then drop the redundant column.
ALTER TABLE public.student_invoices
  ALTER COLUMN receipt_type_id SET NOT NULL;

ALTER TABLE public.student_invoices
  DROP COLUMN invoice_name;
```

- [ ] **Step 2: รัน migration ลง local DB**

Run: `npm run db:push`
Expected: migration ใหม่ apply สำเร็จ ไม่มี error (ทุกแถวมี `receipt_type_id` แล้วจาก backfill เดิม จึง SET NOT NULL ผ่าน)

หาก `db:push` ไม่ตรงกับ workflow ของเครื่องนี้ ใช้ `npm run db:reset` แทนเพื่อ apply migration ทั้งหมดใหม่

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260611000200_drop_invoice_name.sql
git commit -m "feat(db): drop invoice_name, require receipt_type_id on student_invoices"
```

---

### Task 2: ลบ `invoice_name` ออกจาก generated types

**Files:**
- Modify: `src/lib/supabase/types.ts:106`

- [ ] **Step 1: ลบ field**

ใน `src/lib/supabase/types.ts` block `student_invoices: TableDef<{...}>` ลบบรรทัด:

```typescript
        invoice_name: string;
```

- [ ] **Step 2: Commit (รวมกับ Task 3 ได้ แต่ commit แยกเพื่อความชัด)**

ข้ามไป Task 3 ก่อนแล้วค่อย commit รวม เพราะการลบ type จะทำให้ tsc ฟ้องจุดที่ยังอ้าง field นี้ — เป็นตัวช่วยหา consumer ครบ

---

### Task 3: queries/invoices.ts — derive invoiceName จาก receipt type

**Files:**
- Modify: `src/lib/queries/invoices.ts`

ไฟล์นี้มี 2 ฟังก์ชันที่ select `invoice_name`: `fetchAllInvoices` และ `fetchInvoicesPaginated` รูปแบบแก้เหมือนกันทั้งคู่

- [ ] **Step 1: `fetchAllInvoices` — แก้ select**

ใน select string (ราว line 149) เปลี่ยน `invoice_name,` เป็น:

```
      receipt_type_id,
      receipt_types ( name ),
```

หมายเหตุ: `receipt_type_id` มีอยู่แล้วใน select เดิม — ให้ลบบรรทัด `invoice_name,` ออกแล้วเพิ่ม `receipt_types ( name ),` ต่อท้ายบรรทัด `receipt_type_id,` เดิม (อย่าให้ `receipt_type_id` ซ้ำ)

- [ ] **Step 2: `fetchAllInvoices` — แก้ Row type**

ใน `type Row` (ราว line 168) ลบ `invoice_name: string;` และเพิ่ม:

```typescript
    receipt_types: { name: string } | null;
```

- [ ] **Step 3: `fetchAllInvoices` — แก้ mapping**

เปลี่ยน `invoiceName: row.invoice_name,` เป็น:

```typescript
      invoiceName: row.receipt_types?.name ?? "—",
```

- [ ] **Step 4: `fetchInvoicesPaginated` — ทำซ้ำ Step 1-3**

ทำแบบเดียวกันใน `fetchInvoicesPaginated`:
- select (ราว line 285): ลบ `invoice_name,`, เพิ่ม `receipt_types ( name ),` ต่อจาก `receipt_type_id,`
- `type Row` (ราว line 332): ลบ `invoice_name: string;`, เพิ่ม `receipt_types: { name: string } | null;`
- mapping (ราว line 359): `invoiceName: row.receipt_types?.name ?? "—",`

- [ ] **Step 5: ตรวจ tsc เฉพาะไฟล์นี้ยังไม่ฟ้อง invoice_name**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ที่ `queries/invoices.ts` (อาจยังมี error ที่ไฟล์อื่นที่ยังไม่แก้ — โอเค จะแก้ใน Task ถัดไป)

---

### Task 4: data/invoices.ts — derive invoiceName จาก receipt type

**Files:**
- Modify: `src/lib/data/invoices.ts`

มี 2 ฟังก์ชัน: `listInvoicesPaginated` และ `getStudentOutstandingInvoices`

- [ ] **Step 1: `listInvoicesPaginated` — แก้ select**

ใน select (ราว line 100) ลบ `invoice_name,` แล้วเพิ่ม `receipt_types ( name ),` ต่อจาก `receipt_type_id,` เดิม

- [ ] **Step 2: `listInvoicesPaginated` — แก้ Row type + mapping**

`type Row` (ราว line 140): ลบ `invoice_name: string;`, เพิ่ม `receipt_types: { name: string } | null;`
mapping (ราว line 168): `invoiceName: row.receipt_types?.name ?? "—",`

- [ ] **Step 3: `getStudentOutstandingInvoices` — แก้ select**

ใน select (ราว line 200) เปลี่ยน:

```typescript
    .select("id, invoice_name, total_amount, paid_amount, created_at, status, invoice_lines(id, description, amount)")
```

เป็น:

```typescript
    .select("id, receipt_types ( name ), total_amount, paid_amount, created_at, status, invoice_lines(id, description, amount)")
```

- [ ] **Step 4: `getStudentOutstandingInvoices` — แก้ Row type + mapping**

`type Row` (ราว line 206): ลบ `invoice_name: string;`, เพิ่ม `receipt_types: { name: string } | null;`
mapping (ราว line 225): `invoiceName: row.receipt_types?.name ?? "—",`

---

### Task 5: data/receipt-print.ts — บรรทัดรวบยอดใช้ชื่อ receipt type

**Files:**
- Modify: `src/lib/data/receipt-print.ts`

- [ ] **Step 1: แก้ select ของ student_invoices**

ใน select string (ราว line 64-68) ภายใต้ `student_invoices (` เปลี่ยน `invoice_name,` เป็น `receipt_types ( name ),`:

```
        student_invoices (
          receipt_types ( name ),
          semesters ( number ),
          invoice_lines ( amount, fee_items ( name ) )
        )
```

- [ ] **Step 2: แก้ RawPayment type**

ใน `type RawPayment` (ราว line 35) ภายใน `student_invoices: {` เปลี่ยน:

```typescript
      invoice_name: string;
```

เป็น:

```typescript
      receipt_types: { name: string } | null;
```

- [ ] **Step 3: แก้บรรทัดรวบยอดตอนชำระบางส่วน**

ราว line 97 เปลี่ยน:

```typescript
    return [{ name: inv.invoice_name, amount: allocAmount }];
```

เป็น:

```typescript
    return [{ name: inv.receipt_types?.name ?? "รายการค่าธรรมเนียม", amount: allocAmount }];
```

---

### Task 6: actions/payments.ts — snapshot allocation ใช้ชื่อ receipt type

**Files:**
- Modify: `src/lib/actions/payments.ts`

- [ ] **Step 1: แก้ select ของ recordPayment**

ราว line 47 เปลี่ยน:

```typescript
    .select("id, invoice_name, total_amount, paid_amount, receipt_type_id, student_id")
```

เป็น:

```typescript
    .select("id, total_amount, paid_amount, receipt_type_id, student_id, receipt_types ( name )")
```

- [ ] **Step 2: แก้การใช้ใน allocationDetails**

ราว line 93-97 เปลี่ยน:

```typescript
  const allocationDetails = allocations.map((a) => ({
    invoiceId: a.invoiceId,
    invoiceName: invoice.invoice_name,
    amount: a.amount,
  }));
```

เป็น:

```typescript
  const invoiceName =
    (invoice as unknown as { receipt_types: { name: string } | null }).receipt_types?.name ?? "—";
  const allocationDetails = allocations.map((a) => ({
    invoiceId: a.invoiceId,
    invoiceName,
    amount: a.amount,
  }));
```

หมายเหตุ: ใช้ cast เพราะ `invoice` มาจาก `.maybeSingle()` ที่ infer type จาก select — nested relation `receipt_types` จะถูก infer เป็น object/array ขึ้นกับเวอร์ชัน ใช้ cast ให้ชัดเจนและสอดคล้องกับ pattern เดิมในไฟล์นี้

---

### Task 7: actions/invoices.ts — เลิก insert invoice_name

**Files:**
- Modify: `src/lib/actions/invoices.ts`

- [ ] **Step 1: ลบตัวแปร invoiceName**

ราว line 146 ลบบรรทัด:

```typescript
  const invoiceName = `ภาคเรียนที่ ${input.semesterNumber}/${input.academicYearName}`;
```

- [ ] **Step 2: ลบ field จาก local type InvoiceRow**

ใน `type InvoiceRow` (ราว line 151) ลบบรรทัด:

```typescript
    invoice_name: string;
```

- [ ] **Step 3: ลบ field จาก object ที่ push เข้า invoiceRows**

ราว line 217 ลบบรรทัด:

```typescript
      invoice_name: invoiceName,
```

- [ ] **Step 4: ตรวจว่า `input.semesterNumber` / `academicYearName` ยังถูกใช้ที่อื่นไหม**

`semesterNumber` และ `academicYearName` ยังเป็น field ของ `GenerateInput` และอาจใช้ที่อื่น — ไม่ต้องลบออกจาก type input แค่เลิกใช้สร้าง invoiceName เท่านั้น ไม่ต้องแตะ `InvoiceGenerateDialog`

---

### Task 8: UI — เปลี่ยนหัวคอลัมน์เป็น "ประเภทใบแจ้ง"

**Files:**
- Modify: `src/components/finance/invoices-panel.tsx:540`

- [ ] **Step 1: เปลี่ยนหัวคอลัมน์**

ราว line 540 เปลี่ยน:

```tsx
                    <TableHead>ใบแจ้ง</TableHead>
```

เป็น:

```tsx
                    <TableHead>ประเภทใบแจ้ง</TableHead>
```

เซลล์ (`row.invoiceName`) และการ์ด mobile ไม่ต้องแก้ — ค่ามาจาก receipt type แล้ว

---

### Task 8.5: เปลี่ยนคำเรียกที่แสดงผล "ประเภทใบเสร็จ" → "ประเภทใบแจ้ง" ทั้งแอป

เปลี่ยน **เฉพาะวลี** `ประเภทใบเสร็จ` เป็น `ประเภทใบแจ้ง` ในข้อความที่แสดงต่อผู้ใช้
ห้ามแตะชื่อตาราง/ตัวแปร/route (`receipt_type`, `receiptTypeId`, `/receipt-types`)
และห้ามแตะคำว่า `ใบเสร็จ` เดี่ยวๆ (ใบเสร็จจริงที่พิมพ์)

**Files (แต่ละไฟล์ใช้ replace_all วลี `ประเภทใบเสร็จ` → `ประเภทใบแจ้ง`):**
- `src/components/app-sidebar.tsx` — 1 จุด (label เมนู, line 30)
- `src/components/finance/receipt-types-panel.tsx` — 6 จุด (lines 94, 102, 120, 125, 186)
- `src/components/finance/invoice-generate-dialog.tsx` — 2 จุด (lines 197, 263)
- `src/lib/actions/receipt-types.ts` — 4 จุด (lines 34, 36, 70, 72)
- `src/lib/actions/fee-items.ts` — 1 จุด (line 26)
- `src/lib/actions/invoices.ts` — 2 จุด (lines 78, 96)
- `src/lib/actions/payments.ts` — 2 จุด (lines 65, 278)

- [ ] **Step 1: แทนที่ทุกไฟล์ข้างต้น**

ในแต่ละไฟล์ แทนที่ทุก occurrence ของสตริง `ประเภทใบเสร็จ` ด้วย `ประเภทใบแจ้ง`
(การแทนแบบ substring ปลอดภัย เพราะ `ใบเสร็จ` เดี่ยวๆ ไม่มี prefix `ประเภท`)

- [ ] **Step 2: ยืนยันไม่เหลือคำเดิมในโค้ด**

Run: `git grep -n "ประเภทใบเสร็จ" -- "src/"`
Expected: ไม่มีผลลัพธ์

---

### Task 9: Verification gate + commit รวม

- [ ] **Step 1: ยืนยันไม่มีที่ไหนอ้าง invoice_name แล้ว**

Run: `git grep -n "invoice_name" -- "src/**/*.ts" "src/**/*.tsx"`
Expected: ไม่มีผลลัพธ์ (ทุกจุดในโค้ดถูกแก้แล้ว) — มีเหลือได้เฉพาะใน `docs/` และ `supabase/migrations/`

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: ไม่มี error

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: ไม่มี error ใหม่

- [ ] **Step 4: Build (จับ error ฝั่ง Next.js)**

Run: `npm run build`
Expected: build ผ่าน

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat(invoice): derive invoice name from receipt type, drop invoice_name"
```

---

## Manual verification (หลัง execute ครบ)

- หน้า `/invoices`: คอลัมน์ "ประเภทใบแจ้ง" แสดงชื่อประเภทของแต่ละใบแจ้ง
- เมนู sidebar และหน้า `/receipt-types`: แสดงคำว่า "ประเภทใบแจ้ง"
- หน้า `/payments`: เลือกนักเรียน → รายการใบค้างชำระแสดงชื่อประเภท
- ชำระเงินเต็มจำนวน → พิมพ์ใบเสร็จ → line items เป็นรายการค่าธรรมเนียม (เหมือนเดิม)
- ชำระบางส่วน → พิมพ์ใบเสร็จ → บรรทัดรวบยอดแสดงชื่อประเภท

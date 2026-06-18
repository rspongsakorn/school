# ส่วนลดตอนรับชำระเงิน (Payment-time Discount)

วันที่: 2026-06-18

## ที่มา / ปัญหา

ปัจจุบันส่วนลดถูกตั้งบน "ใบแจ้งชำระ" ล่วงหน้า (ปุ่ม "ส่วนลด" ในหน้า Invoices)
ผ่าน `updateInvoiceDiscount` ซึ่งเขียนทับ `total_amount` ตั้งแต่ตอนออกใบแจ้ง

แต่กระบวนการจริงของโรงเรียนคือ: **ใบแจ้งควรออกเต็มจำนวนเสมอ** แล้วส่วนลดจะให้
ตอนผู้ปกครองมาชำระเงิน (เช่น "จ่ายค่าเทอมภายในเดือนนี้ลด 500") โดยต้องระบุได้ว่า
ส่วนลดนั้นเป็นของค่าใช้จ่ายรายการไหน

เป้าหมาย: ย้ายการกรอกส่วนลดไปอยู่ที่ขั้นตอนรับชำระเงิน แบบรายรายการ (per fee line)

## ขอบเขตที่ตกลงไว้ (decisions)

1. **กรอกส่วนลดแยกแต่ละรายการ** ในป๊อปอัปรับเงิน — ลดได้หลายรายการพร้อมกันในการจ่ายครั้งเดียว
2. **เมื่อมีส่วนลด จ่ายครบในครั้งเดียวเสมอ** (ปิดยอดใบแจ้งทันที ไม่มีกรณีจ่ายแบ่งงวดพร้อมส่วนลด)
3. **เอาปุ่มส่วนลดเดิมที่หน้าใบแจ้งออก** — ใช้ส่วนลดตอนจ่ายอย่างเดียว
4. **ช่องส่วนลดแต่ละรายการรับได้ทั้งบาทและ %**
5. **ทำรายงานสรุปส่วนลดในรอบนี้ด้วย** (รวมยอดตามช่วงเวลา + แยกตามรายการ)
6. **ใบเสร็จแสดงแบบบรรทัดส่วนลดแยก** (ราคาเต็ม → รวม → หักส่วนลด → รวมสุทธิ)

## โมเดลข้อมูล (Approach A)

หลักการ: ใบแจ้งเก็บราคาเต็มจนกว่าจะรับเงิน ตอนรับเงินจึง "ลด `total_amount`" ลงเป็นยอดสุทธิ
และเก็บรายละเอียดส่วนลดไว้ในตารางใหม่ที่ผูกกับการชำระ

### `student_invoices` (ไม่เพิ่มคอลัมน์)

- `subtotal` = ราคาเต็ม (ผลรวม `invoice_lines.amount`) — ไม่เปลี่ยนแปลง
- `total_amount` = **ยอดสุทธิที่ต้องจ่ายจริง** หลังหักส่วนลด
  - ตอนออกใบแจ้ง: `total_amount = subtotal` (ไม่มีส่วนลด)
  - ตอนรับเงินมีส่วนลด: `total_amount = subtotal − totalDiscount`
- **ส่วนลดของใบแจ้ง = `subtotal − total_amount`** (คำนวณได้เสมอ ไม่ต้องเก็บซ้ำ)
- `outstanding = total_amount − paid_amount` (สูตรเดิม ไม่ต้องแก้)

### `invoice_lines` (ไม่เปลี่ยน)

เก็บราคาเต็มของแต่ละรายการตลอด ไม่ถูกแก้ตอนให้ส่วนลด

### ตารางใหม่ `payment_discounts`

```sql
CREATE TABLE public.payment_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  invoice_line_id uuid NOT NULL REFERENCES public.invoice_lines (id) ON DELETE RESTRICT,
  fee_item_id uuid NOT NULL REFERENCES public.fee_items (id) ON DELETE RESTRICT,
  discount_type public.discount_type NOT NULL,   -- 'percent' | 'fixed'
  discount_value numeric(12, 2) NOT NULL,        -- ค่าที่ผู้ใช้กรอก (500 หรือ 10)
  amount numeric(12, 2) NOT NULL,                -- ส่วนลดที่คำนวณเป็นบาทแล้ว
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_discounts_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT payment_discounts_value_non_negative CHECK (discount_value >= 0)
);
CREATE INDEX idx_payment_discounts_payment_id ON public.payment_discounts (payment_id);
CREATE INDEX idx_payment_discounts_fee_item_id ON public.payment_discounts (fee_item_id);
```

- เก็บ `fee_item_id` ซ้ำ (denormalized) เพื่อให้รายงานสรุปตามรายการค่าใช้จ่ายทำได้ง่าย
- RLS: เหมือน `payment_allocations` — admin/finance เขียนได้, teacher อ่านได้ (scoped)
- เปิด `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`

### คอลัมน์ส่วนลดเดิมบนใบแจ้ง (legacy)

`student_invoices.discount_type` และ `discount_value` — **คงไว้ในตาราง** เพื่อไม่กระทบข้อมูลเก่า
แต่ **ตัดทุก path ที่อ่าน/เขียน** ออก (ดูหัวข้อ "งานที่ต้องลบ")

## Flow ตัวอย่าง

ใบแจ้ง 11,500 (ค่าเล่าเรียน 8,000 + อาหาร 2,000 + รถ 1,500) ลดค่าเล่าเรียน 500:

| ขั้นตอน | subtotal | total_amount | paid_amount | status |
|---|---|---|---|---|
| ออกใบแจ้ง | 11,500 | 11,500 | 0 | unpaid |
| รับเงิน (ลด 500) | 11,500 | 11,000 | 11,000 | paid |

- `payment_discounts`: 1 แถว → (line=ค่าเล่าเรียน, type=fixed, value=500, amount=500)
- ส่วนลด = 11,500 − 11,000 = 500 · outstanding = 11,000 − 11,000 = 0

## การเปลี่ยนแปลงฝั่ง Server

### `recordPayment` (`src/lib/actions/payments.ts`)

เพิ่ม input:

```ts
discounts?: {
  invoiceLineId: string;
  feeItemId: string;
  discountType: "percent" | "fixed";
  discountValue: number;
}[];
```

ลำดับการทำงานเมื่อมีส่วนลด:

1. โหลดใบแจ้ง + `invoice_lines` ทั้งหมด
2. ตรวจว่าใบแจ้ง `paid_amount = 0` (ส่วนลดให้ได้เฉพาะใบที่ยังไม่จ่าย)
3. สำหรับแต่ละ discount input:
   - ตรวจว่า `invoiceLineId` เป็นรายการของใบแจ้งนี้จริง และ `feeItemId` ตรงกับ line
   - คำนวณ `amount`: `fixed` → `discountValue`; `percent` → `round2(line.amount * discountValue / 100)`
   - ตรวจ `amount ≤ line.amount` (ลดเกินราคารายการไม่ได้) และ (สำหรับ percent) `0 ≤ value ≤ 100`
4. `totalDiscount = Σ amount`; `netDue = round2(subtotal − totalDiscount)`
5. ตรวจ `netDue > 0` (ลด 100% ทั้งใบไม่ได้ เพราะ `payments.amount` ต้อง > 0)
6. ตรวจว่า `input.amount === netDue` (จ่ายเต็มยอดสุทธิ — บังคับจ่ายครบ)
7. เขียน (เรียงตามลำดับ rollback แบบเดิม):
   - `payments` (amount = netDue)
   - `payment_allocations` (amount = netDue)
   - `receipts` (snapshot)
   - `payment_discounts` (หลายแถว)
   - อัปเดต `student_invoices`: `total_amount = netDue`, `paid_amount = netDue`, `status = 'paid'`

กรณีไม่มีส่วนลด: ทำงานเหมือนเดิมทุกประการ (รองรับจ่ายบางส่วนได้)

### `voidPayment` (`src/lib/actions/payments.ts`)

- โหลด `payment_discounts` ของ payment นี้
- ถ้ามีส่วนลด: ตอนคืนค่าใบแจ้งให้ตั้ง `total_amount = subtotal` (เต็ม) ก่อน
  แล้ว `paid_amount −= alloc.amount` (→ 0), `status = deriveInvoiceStatus(0, subtotal)` = `unpaid`
- ถ้าไม่มีส่วนลด: ทำงานเหมือนเดิม (`total_amount` คงเดิมอยู่แล้วเพราะ = subtotal)
- ไม่ลบแถว `payment_discounts` — เก็บไว้ audit; รายงานกรองด้วย `payments.status = 'active'`

### `updateInvoiceDiscount` — **ลบ**

ลบ server action นี้ทั้งหมด พร้อม path ที่เรียกใช้

## การเปลี่ยนแปลงฝั่ง UI

### ป๊อปอัปรับเงิน (`src/components/finance/invoice-payment-dialog.tsx`)

- ตารางรายการเพิ่มคอลัมน์ "ส่วนลด": แต่ละ `invoice_line` มีช่องกรอกตัวเลข + ปุ่มสลับหน่วย บาท/%
- คำนวณยอดสุทธิแบบ live: `netDue = subtotal − Σ discount`
- ถ้ามีส่วนลดอย่างน้อย 1 รายการ → ช่อง "จำนวนเงิน" ล็อกเป็น `netDue` (บังคับจ่ายเต็ม)
- ถ้าไม่มีส่วนลด → ช่องจำนวนเงินแก้ได้เหมือนเดิม (จ่ายบางส่วนได้ ≤ outstanding)
- validation ฝั่ง client: ส่วนลดต่อรายการ ≤ ราคารายการ, percent 0–100, `netDue > 0`
- ส่ง `discounts[]` ไปกับ `recordPayment`

### หน้าใบแจ้ง (`src/components/finance/invoices-panel.tsx`)

- ลบปุ่ม "ส่วนลด" และ state `discountTarget`
- ลบการ import/ใช้ `InvoiceDiscountDialog`

### ลบไฟล์ `src/components/finance/invoice-discount-dialog.tsx`

## ใบเสร็จ

### `getReceiptPrintData` (`src/lib/data/receipt-print.ts`)

- ดึง `payment_discounts` ของ payment (join `fee_items` เพื่อเอาชื่อ)
- เพิ่มในผลลัพธ์:
  - `subtotal`: ผลรวมราคาเต็มของ line items
  - `discounts: { name: string; amount: number }[]`
  - `amount`: ยอดสุทธิ (เท่าเดิม = `payments.amount`)
- ปรับ logic เดิมที่ "ถ้า alloc ≠ linesTotal ให้ยุบเป็นบรรทัดเดียว": เมื่อมีส่วนลด
  ให้แสดงรายการเต็มทุกบรรทัดได้ (เพราะส่วนต่างอธิบายด้วยบรรทัดส่วนลด)

### หน้าใบเสร็จ (`src/app/receipts/[paymentId]/page.tsx`)

ปรับ `tfoot` ของตาราง:
1. รายการเต็มทุกบรรทัด (เหมือนเดิม)
2. แถว **รวม** = `subtotal`
3. แถว **หัก ส่วนลด (ชื่อรายการ)** = `−amount` ต่อรายการที่ลด (สีแดง)
4. แถว **รวมสุทธิ** = `amount` (net, สีเขียวเหมือนเดิม)
5. จำนวนเงินเป็นตัวอักษร = `bahtText(amount)` (net)

ถ้าไม่มีส่วนลด: ข้ามแถว "รวม" และ "หักส่วนลด" → แสดง "รวมทั้งสิ้น" แบบเดิม

## รายงานส่วนลด

หน้าใหม่ `src/app/(dashboard)/reports/discounts/page.tsx` + panel
`src/components/finance/discount-report-panel.tsx` + data function ใน `src/lib/data/reports.ts`

- แหล่งข้อมูล: `payment_discounts` join `payments` (status = 'active') + `fee_items` (ชื่อ)
- กรองช่วงเวลาด้วย `payments.paid_at`; scope ด้วยปีการศึกษา/ภาคเรียนปัจจุบัน
- แสดง:
  - ผลรวมส่วนลดทั้งหมดในช่วง
  - แยกตามรายการค่าใช้จ่าย (fee item): ชื่อ, จำนวนครั้ง, ยอดรวมส่วนลด
  - (ตัวเลือก) รายการระดับนักเรียน/ใบเสร็จ
- เพิ่มลิงก์ในหน้า `reports/page.tsx` และเมนูนำทาง (ตามรูปแบบรายงานอื่น)

### รายงาน outstanding เดิม (`src/lib/data/reports.ts`)

- ฟังก์ชัน `discountLabel` และคอลัมน์ "ส่วนลด" อิงคอลัมน์เก่า → กลายเป็น legacy
  (ใบที่มีส่วนลดจะ `status = paid` จึงไม่ปรากฏในรายงานค้างชำระ)
- ลบเฉพาะ **คอลัมน์ "ส่วนลด"** ออกจากรายงาน outstanding: ตัด `discountLabel`
  ออกจาก `OutstandingReportRow` + helper `discountLabel` + คอลัมน์ในตาราง panel
- **คง** `subtotal`/`totalAmount` ในรายงานไว้ (ยังใช้แสดงยอด) — ไม่แตะ

## งานที่ต้องลบ (cleanup)

- `updateInvoiceDiscount` action + การเรียกใช้
- `InvoiceDiscountDialog` component + ปุ่ม/์state ในหน้า invoices
- field `discountType`/`discountValue` ใน `InvoiceListRow` (ทั้ง `src/lib/data/invoices.ts`
  และ `src/lib/queries/invoices.ts`) และการ select คอลัมน์เหล่านั้น — ถ้าไม่มีที่อื่นใช้
- `discountLabel` + คอลัมน์ส่วนลดในรายงาน outstanding

## Edge cases

- **ลด 100% ทั้งใบ** (netDue = 0): ไม่รองรับในรอบนี้ (payment ต้อง > 0) — กรณียกเว้น
  เต็มจำนวน (ทุนเรียนฟรี) ต้องออกแบบแยกภายหลัง
- **ส่วนลดเกินราคารายการ**: บล็อกทั้ง client และ server
- **ใบแจ้งจ่ายไปแล้วบางส่วน**: กรอกส่วนลดไม่ได้ (เงื่อนไข `paid_amount = 0`)
- **void แล้วรับใหม่**: void คืน `total_amount = subtotal` → รับเงินใหม่พร้อมส่วนลดใหม่ได้

## การทดสอบ

- unit: คำนวณ `amount` ต่อ line (fixed/percent), `netDue`, การปัดเศษ (ต่อยอดจาก
  `src/lib/finance/amounts.test.ts`)
- unit: เงื่อนไข validation (ลดเกินราคา, percent นอกช่วง, netDue ≤ 0, ใบจ่ายแล้ว)
- integration: recordPayment มีส่วนลด → ตรวจ `student_invoices` + `payment_discounts`
- integration: voidPayment ใบที่มีส่วนลด → `total_amount` กลับเป็น subtotal, status unpaid
- ใบเสร็จ: แสดงบรรทัดส่วนลด + รวมสุทธิถูกต้อง

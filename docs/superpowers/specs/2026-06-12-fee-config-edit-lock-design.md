# ล็อกการแก้ไขค่าธรรมเนียมเมื่อออกใบแจ้งชำระแล้ว

**วันที่:** 2026-06-12
**สถานะ:** อนุมัติดีไซน์แล้ว — รอทำแผน implementation

## ปัญหา

ในไดอะล็อก "ตั้งค่าค่าธรรมเนียม" (`InvoiceTypeFeeDialog`) มีสองส่วนที่แก้ไขข้อมูลได้อย่างอิสระ:

- **รายการค่าใช้จ่าย** (`FeeItemsSection`) — แก้ชื่อ/คำอธิบาย/isTuition/มี 2 ราคา/เปิด-ปิดใช้งาน ผ่าน `updateFeeItem`
- **อัตราค่าธรรมเนียมตามชั้น** (`FeeRatesMatrix`) — แก้จำนวนเงินต่อ (ชั้น × รายการ) ผ่าน `upsertFeeRates`

เมื่อออกใบแจ้งชำระแล้ว ข้อมูลเหล่านี้ถูก snapshot ลง `invoice_lines` ของบิลที่ออกไป การแก้ไขต้นทาง (ชื่อรายการ, จำนวนเงิน) ภายหลังทำให้การตั้งค่าขัดแย้งกับบิลที่ออกไปแล้ว ต้องล็อกไม่ให้แก้

## กฎการล็อก

| ส่วน | หน่วยที่ล็อก | เงื่อนไข "ออกบิลแล้ว" |
|---|---|---|
| รายการค่าใช้จ่าย | เฉพาะรายการนั้น (ทุก field **ยกเว้น** `is_active`) | มี `invoice_lines` อ้างถึง `fee_item` นี้ (ทุกภาค/ประเภท) |
| อัตราค่าธรรมเนียม | ทั้งแถวของชั้นนั้น | ชั้นนั้นมีใบแจ้งชำระของประเภทนี้ในภาคนี้ |

### สิ่งที่ตั้งใจ **ไม่** ล็อก
- เปิด/ปิดใช้งานรายการ (`is_active`) — เป็น flag สำหรับการออกบิลรอบถัดไป ไม่กระทบบิลเก่า และจำเป็นต้องปิดรายการที่เคยใช้ได้
- การลากเรียงลำดับรายการ (`sort_order`) — เป็นแค่ลำดับคอลัมน์ ไม่กระทบข้อมูลบิล
- การลบรายการ/ใบแจ้ง — มี logic บล็อกอยู่แล้ว (`fee-item-delete-eligibility`, `invoice-delete-eligibility`)

### เหตุผลของการเลือกหน่วยล็อก
- **รายการค่าใช้จ่าย → ระดับรายการ**: ตรงกับการบล็อกลบที่มีอยู่ (อิง `invoice_lines.fee_item_id`)
- **อัตราค่าธรรมเนียม → ระดับแถวชั้น**: ใบแจ้งออกเป็นชุดต่อชั้น พอออกบิลให้ชั้นหนึ่งแล้ว ราคาทั้งแถวของชั้นนั้นผูกพันกับบิล; query เบากว่าการล็อกรายช่อง (ไม่ต้อง join `invoice_lines` รายรายการ) และโมเดลความคิดตรงกับฝั่งรายการ
  - **ข้อแลกเปลี่ยนที่ยอมรับ**: ถ้าออกบิลชั้น ป.1 ด้วยรายการเดียว แล้วภายหลังอยากเพิ่มราคาให้รายการใหม่ของ ป.1 จะถูกบล็อกทั้งแถว — ยอมรับได้เพราะเคสนี้เกิดยาก

## สถาปัตยกรรม

### 1. Logic ล้วน (pure, testable — ตามแบบ `*-eligibility.ts` ที่โปรเจกต์ใช้อยู่)

**`src/lib/finance/fee-item-edit-eligibility.ts`**
```ts
export type FeeItemLockableFields = {
  name: string;
  description: string | null;
  isTuition: boolean;
  hasReimbursableVariant: boolean;
};

// field ที่ถูกแช่แข็งเมื่อรายการปรากฏในใบแจ้งที่ออกแล้ว (is_active ไม่นับ)
export function feeItemLockedFieldsChanged(
  current: FeeItemLockableFields,
  next: FeeItemLockableFields,
): boolean;
```
คืน `true` ถ้ามี field ที่ล็อกถูกแก้ (เทียบ `description` โดย normalize `null`/`""` ให้เท่ากัน)

**`src/lib/finance/fee-rate-edit-eligibility.ts`**
```ts
export function partitionRateEntriesByLock<T extends { gradeLevelId: string }>(
  entries: T[],
  lockedGradeIds: Set<string>,
): { allowed: T[]; locked: T[] };
```

แต่ละไฟล์มี `.test.ts` คู่กัน (เขียนเทสก่อน — TDD)

### 2. Data queries (client-side, `src/lib/queries/fee-rates.ts`)

เพิ่มสองฟังก์ชันใหม่ (ไม่แตะ return type ของ `fetchFeeItems` / `fetchFeeRateMatrix` เดิม):

**`fetchInvoicedFeeItemIds(invoiceTypeId: string): Promise<string[]>`**
- `invoice_lines` select `fee_item_id`, join `fee_items!inner(invoice_type_id)` eq `invoiceTypeId`
- คืนรายการ `fee_item_id` ไม่ซ้ำ

**`fetchInvoicedGradeIds(semesterId: string, invoiceTypeId: string): Promise<string[]>`**
- `student_invoices` select `student_id` where `semester_id` + `invoice_type_id`
- `student_enrollments` select `student_id, classrooms(grade_level_id)` where `semester_id`, `status = enrolled`, `student_id in (...)`
- คืน `grade_level_id` ไม่ซ้ำ

### 3. ดึงข้อมูลล็อกในไดอะล็อก

`InvoiceTypeFeeDialog` เพิ่มสอง `useQuery`:
- `["invoiced-fee-items", invoiceTypeId]` → `fetchInvoicedFeeItemIds`
- `["invoiced-grades", semesterId, invoiceTypeId]` → `fetchInvoicedGradeIds`

ส่งผลลัพธ์เป็น `Set<string>` ลงไปเป็น prop:
- `FeeItemsSection` รับ `lockedItemIds: Set<string>`
- `FeeRatesMatrix` รับ `lockedGradeIds: Set<string>` + `invoiceTypeId: string`

ทั้งสอง query ต้อง invalidate เมื่อมีการออก/ลบใบแจ้ง (เพิ่ม key เข้าใน `refreshLists` / จุดที่เกี่ยวข้อง)

### 4. UI

**`FeeItemsSection`**
- แถวที่อยู่ใน `lockedItemIds` แสดง badge/ไอคอนล็อก "ออกบิลแล้ว"
- กด "แก้ไข" เปิดไดอะล็อกได้ปกติ แต่ถ้าล็อก:
  - input ชื่อ/คำอธิบาย + checkbox "มี 2 ราคา" → `disabled`
  - แสดงข้อความ "ออกใบแจ้งชำระแล้ว — แก้ได้เฉพาะสถานะใช้งาน"
  - checkbox "ใช้งานอยู่" → ยังกดได้
  - กดบันทึกได้ (ส่งค่า field ที่ล็อกเท่าเดิม + `is_active` ที่อาจเปลี่ยน)

**`FeeRatesMatrix`**
- แถวชั้นที่อยู่ใน `lockedGradeIds`: `Input` ทุกช่องในแถว → `disabled`, ชื่อชั้นมีป้าย/ไอคอนล็อก
- `changedEntries` กรอง entry ของชั้นที่ล็อกออกก่อน (กันส่งโดยไม่ตั้งใจ)

### 5. บังคับใช้ฝั่ง server (กัน client bypass)

**`updateFeeItem(id, input)`** (`src/lib/actions/fee-items.ts`)
- โหลดแถวปัจจุบัน (`name, description, is_tuition, has_reimbursable_variant`)
- เช็คว่ามี `invoice_lines` อ้างถึง `id` หรือไม่
- ถ้าถูกอ้างถึง **และ** `feeItemLockedFieldsChanged(current, input)` เป็น `true` → คืน `{ ok: false, error: "ออกใบแจ้งชำระแล้ว ไม่สามารถแก้ไขรายการนี้ได้ (แก้ได้เฉพาะสถานะใช้งาน)" }`
- กรณีอื่น → update ตามปกติ (รวมการเปลี่ยน `is_active`)

**`upsertFeeRates(semesterId, invoiceTypeId, entries)`** (`src/lib/actions/fee-rates.ts`)
- เพิ่มพารามิเตอร์ `invoiceTypeId`
- คำนวณ `lockedGradeIds` (logic เดียวกับ `fetchInvoicedGradeIds` แต่ฝั่ง server ผ่าน `src/lib/data/*`)
- `partitionRateEntriesByLock(entries, lockedGradeIds)` — ถ้า `locked.length > 0` → คืน error; upsert เฉพาะ `allowed`
- ปรับ caller (`FeeRatesMatrix`) ให้ส่ง `invoiceTypeId`

> หมายเหตุ: ฝั่ง server ต้องมี data helper ดึง `lockedGradeIds` (เช่น `listInvoicedGradeLevelIds(semesterId, invoiceTypeId)` ใน `src/lib/data/invoices.ts` หรือ `fee-rates.ts`) ใช้ supabase server client คู่ขนานกับ query ฝั่ง client

## การทดสอบ

- **Unit (Vitest)**: `feeItemLockedFieldsChanged`, `partitionRateEntriesByLock` — ครอบคลุมเคสล็อก/ไม่ล็อก, แก้เฉพาะ is_active, description null vs ""
- **Manual (preview)**:
  1. รายการที่ยังไม่ออกบิล → แก้ได้ทุก field
  2. ออกบิลที่อ้างรายการหนึ่ง → รายการนั้นล็อก field อื่น แต่ยังเปิด/ปิดใช้งานได้
  3. ออกบิลให้ชั้นหนึ่ง → ทั้งแถวของชั้นนั้นในตารางอัตราเป็น read-only; ชั้นอื่นยังแก้ได้
  4. ลองยิง action ตรงด้วยค่าที่ล็อก → server ปฏิเสธ

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/lib/finance/fee-item-edit-eligibility.ts` (+test) | ใหม่ |
| `src/lib/finance/fee-rate-edit-eligibility.ts` (+test) | ใหม่ |
| `src/lib/queries/fee-rates.ts` | เพิ่ม `fetchInvoicedFeeItemIds`, `fetchInvoicedGradeIds` |
| `src/lib/data/invoices.ts` (หรือ `fee-rates.ts`) | เพิ่ม server helper `listInvoicedGradeLevelIds` |
| `src/components/finance/invoice-type-fee-dialog.tsx` | ดึง lock queries + ส่ง prop |
| `src/components/finance/fee-items-section.tsx` | prop `lockedItemIds` + UI ล็อก |
| `src/components/finance/fee-rates-matrix.tsx` | prop `lockedGradeIds`/`invoiceTypeId` + UI ล็อก |
| `src/lib/actions/fee-items.ts` | บังคับใช้ใน `updateFeeItem` |
| `src/lib/actions/fee-rates.ts` | บังคับใช้ใน `upsertFeeRates` |

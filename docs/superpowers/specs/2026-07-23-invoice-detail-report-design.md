# รายงานรายละเอียดใบแจ้งหนี้รายห้อง — Design

## บริบท

ผู้ใช้ต้องการรายงานเก็บเงินระดับ "1 แถวต่อใบแจ้งหนี้" กรองได้ตามห้อง/สถานะ/ประเภทใบแจ้งหนี้
พร้อมวันที่ออกใบและวันที่จ่ายล่าสุด

หน้า `/reports/outstanding` (`OutstandingReportPanel`) มีโครงที่ตรงกับความต้องการนี้อยู่แล้ว:
- Query `fetchOutstandingReport` ดึงจาก `student_invoices` แบบ 1 แถวต่อ invoice ต่อ student
- มีตัวกรอง ชั้น/ห้อง + สถานะ (ปัจจุบันไม่รวม "จ่ายแล้ว") + ประเภท (เบิกได้/เบิกไม่ได้)
- มีมุมมอง "จัดกลุ่มตามห้อง" (`byRoom`) อยู่แล้ว

จึงเลือกขยายหน้านี้แทนการสร้างหน้า/tab ใหม่ เพื่อลดโค้ดซ้ำและไม่ต้องให้ผู้ใช้เรียนรู้หน้าใหม่

## ขอบเขต

เพิ่มลงในหน้า `/reports/outstanding` เท่านั้น:
1. ตัวเลือกสถานะ "จ่ายแล้ว" (`paid`) ใน filter สถานะ
2. ตัวกรองใหม่ "ประเภทใบแจ้งหนี้" (`invoice_type_id`)
3. คอลัมน์ใหม่ในตาราง: วันที่ออกใบ (`issuedAt`), วันที่จ่ายล่าสุด (`lastPaidAt`)

ไม่รวม: หน้า/route ใหม่, การ export เพิ่มเติมนอกจาก print เดิม, การแก้ auth guard

## Data layer

### `src/lib/queries/reports.ts`

**`fetchOutstandingReport`** — แก้ signature:
```ts
export async function fetchOutstandingReport(params: {
  semesterId: string;
  academicYearId: string;
  gradeLevelId?: string;
  classroomId?: string;
  status?: "unpaid" | "partial" | "paid" | "all";
  variant?: "standard" | "reimbursable" | "all";
  invoiceTypeId?: string;          // NEW
  teacherProfileId?: string;
  includeAllStatuses?: boolean;
}): Promise<OutstandingReportRow[]>
```

- เพิ่ม `.eq("invoice_type_id", params.invoiceTypeId)` เมื่อระบุ
- select เพิ่ม join `invoice_types ( name )` และ `created_at`
- เมื่อ `status === "paid"` ให้ `.eq("status", "paid")` (path เดิมรองรับอยู่แล้วผ่าน `params.status !== "all"`)
- เมื่อ `status === "all"` ผู้เรียกต้องส่ง `includeAllStatuses: true` เพื่อไม่ตัดแถว paid ออก (ปัจจุบัน default exclude paid เมื่อไม่ส่ง flag นี้) — UI ฝั่ง outstanding panel จะส่ง flag นี้เสมอเมื่อเปิดใช้ตัวกรองสถานะแบบใหม่ (ดูหัวข้อ UI)

**`OutstandingReportRow`** เพิ่ม field:
```ts
export type OutstandingReportRow = {
  // ...existing fields
  invoiceTypeName: string;
  issuedAt: string;            // ISO, จาก student_invoices.created_at
  lastPaidAt: string | null;   // ISO, max(payments.paid_at) ที่ status='active' ผ่าน payment_allocations
};
```

**วันที่จ่ายล่าสุด**: query แยกต่างหากหลังได้ list invoice ids จาก query หลัก —
```ts
supabase
  .from("payment_allocations")
  .select("invoice_id, payments!inner(paid_at, status)")
  .in("invoice_id", invoiceIds)
  .eq("payments.status", "active")
```
แล้ว reduce หา `max(paid_at)` ต่อ `invoice_id` ในโค้ด (ไม่ query ถ้า `invoiceIds.length === 0`)

**ตัวเลือกประเภทใบแจ้งหนี้**: ใช้ `fetchInvoiceTypes()` ที่มีอยู่แล้วใน `src/lib/queries/invoice-types.ts` โดยตรง ไม่ต้องสร้างใหม่

## UI

### `src/components/finance/outstanding-report-panel.tsx`

- `STATUS_ITEMS` เพิ่ม `{ value: "paid", label: "จ่ายแล้ว" }`
- เมื่อ query, ส่ง `includeAllStatuses: true` เสมอ (เพราะตอนนี้ status list ครอบคลุมทั้ง unpaid/partial/paid/all แล้ว การกรอง "ค้างเฉพาะ" ทำผ่านค่า `status` ที่เจาะจงแทน)
- เพิ่ม Select ใหม่ "ประเภทใบแจ้งหนี้" (`INVOICE_TYPE_ITEMS` จาก query, ต่อท้าย `REIMBURSABLE_ITEMS`), ผูก URL param `invoiceType`
- เพิ่ม URL param `invoiceType` ใน `params`/`pushParams` object ตาม pattern เดิมของ `grade`/`classroom`/`status`/`variant`/`view`
- ตาราง **list view** (desktop): เพิ่มคอลัมน์ "วันที่ออกใบ" และ "จ่ายล่าสุด" ต่อจาก "สถานะ"
- ตาราง **byRoom view**: เพิ่มคอลัมน์เดียวกันในตารางย่อยแต่ละห้อง
- **mobile card**: เพิ่มบรรทัดวันที่ออกใบ/จ่ายล่าสุด ต่อจากแถวยอดเงิน
- ใช้ `formatThaiDate` (มีอยู่แล้วใน `@/lib/format`) แสดงวันที่, แสดง `—` เมื่อ `lastPaidAt` เป็น `null`

## ไม่แตะ
- `page.tsx`, auth guard (`requireReportPage`, `useRequireRole`)
- `ReportToolbar`, `ReportLetterhead`
- Query อื่นที่ไม่เกี่ยวข้อง (`fetchStudentRoster` เรียก `fetchOutstandingReport` อยู่แล้ว — ต้อง trace ผลกระทบตอน implement เพราะ signature เปลี่ยน แต่ field ใหม่เป็น optional/เพิ่มเข้าไปเท่านั้น ไม่ breaking)

## Testing
- Manual: เปิดหน้า `/reports/outstanding`, ทดสอบกรอง ห้อง + สถานะ (รวม "จ่ายแล้ว") + ประเภทใบแจ้งหนี้ ตรวจว่าจำนวนแถว/ยอดถูกต้องเทียบกับข้อมูลจริงในระบบ, ตรวจ mobile view และ print view
- ตรวจว่า `fetchStudentRoster` (ที่เรียก `fetchOutstandingReport` ภายใน) ยังทำงานถูกต้องหลังแก้ signature

# v0 UI Prompts — ระบบจัดการค่าเทอม (ธีมสว่าง โทนโรงเรียน)

ใช้กับ [v0.dev](https://v0.dev) หรือ [v0.app](https://v0.app)  
Stack: **Next.js App Router + shadcn/ui + Tailwind CSS v4**

---

## ขั้นตอนแนะนำ

1. เปิด v0 → สร้าง chat ใหม่
2. วาง **Prompt หลัก (Design system)** ด้านล่าง → Generate
3. วาง **Prompt หน้าจอ** ทีละหน้า (ต่อใน chat เดิม)
4. กด **Add to codebase** หรือ copy โค้ด → วางใน repo นี้
5. ใน Cursor บอก agent: *"integrate v0 output from [screen] into school app"*

**Reference (approved UI):**

- Production: [v0-thai-school-admin-app.vercel.app](https://v0-thai-school-admin-app.vercel.app/)
- v0 chat: [thai-school-admin-app](https://v0.app/chat/thai-school-admin-app-cfvfb3gjEMm)
- Local repo: project root — dashboard integrated from v0 deploy

---

## Prompt หลัก — Design system (วางครั้งแรก)

```
Build a Thai school tuition management admin app UI.

Stack: Next.js 15 App Router, shadcn/ui, Tailwind CSS, lucide-react icons.
Language: ALL labels, nav, buttons, table headers in Thai.

Design — light school theme (NOT dark mode, NOT luxury/gold):
- Feel: trustworthy Thai primary school finance portal, clean and modern like shadcn dashboard blocks
- Background: warm off-white #F8FAFC (slate-50)
- Sidebar: white #FFFFFF with subtle border, grouped nav sections
- Cards: white, rounded-xl, border border-slate-200, NO heavy shadows
- Primary color: school blue #1B6CA8 (buttons, links, active states)
- Accent for finance CTAs: amber-600 #D97706 (e.g. "บันทึกและออกใบเสร็จ")
- Success: emerald-700 for "ชำระแล้ว", Warning: amber for "ค้างชำระ"
- Typography: Inter or Geist for UI, support Thai text (Noto Sans Thai fallback)
- Spacing: generous padding, 44px min touch targets on buttons/inputs

Layout shell (all authenticated pages):
- Left sidebar 260px with school logo + name "โรงเรียนตัวอย่างประถมศึกษา"
- Nav groups:
  ข้อมูลพื้นฐาน: ภาพรวม, ปีการศึกษา, นักเรียน, ลงทะเบียน
  การเงิน: บันทึกการจ่าย, ใบแจ้งชำระ, รายงาน
- Top header bar: page title + year/semester selectors (ปี 2568, ภาค 1) always visible + user menu

UX rules:
- One clear primary button per screen
- Status badges with text + color (not color alone)
- Tables use tabular-nums for money columns (฿)
- Search-first on payment page

Start with the app shell + dashboard page only. Use realistic Thai mock data.
```

---

## Prompt หน้า Login

```
Add a login page for the same school tuition app.

Route: /login
Layout: split screen on desktop — left panel with school illustration or soft blue gradient photo placeholder + school name and tagline in Thai; right panel white card with email/password form.
Mobile: stacked, form only.
Copy in Thai: "เข้าสู่ระบบ", "อีเมล", "รหัสผ่าน;
Primary button: "เข้าสู่ระบบ"
Light theme only. Match the school blue #1B6CA8 primary from the design system.
Use shadcn login-04 style as reference but customize for Thai school branding.
```

---

## Prompt หน้า Dashboard (ภาพรวม)

```
Dashboard page for Thai school tuition CMS.

4 stat cards in a row:
- นักเรียนลงทะเบียน: 1,247
- ยอดที่ต้องเก็บ: ฿18.4M
- ยอดเก็บได้: ฿12.1M (green)
- บัญชีค้างชำระ: 86 (amber badge)

Below: 2-column grid
Left card "งานสำคัญวันนี้" — list with badges (86 ค้างชำระ, 12 ใบแจ้งรอสร้าง, 5 ยังไม่จัดห้อง)
Right card "ยอดเก็บ 7 วันล่าสุด" — simple table (วันที่, รายการ, ยอดเงิน)

Use shadcn Card, Badge, Table. Light school theme. All Thai labels.
Include subtle area chart optional — if added, label axes in Thai.
```

---

## Prompt หน้า บันทึกการจ่าย (สำคัญที่สุด)

```
Payment recording page — walk-in desk workflow for Thai school.

Route: /payments
Layout: 2 columns
LEFT (320px): Card "ค้นหานักเรียน"
- Search input placeholder "รหัส ชื่อ หรือนามสกุล"
- Primary button "ค้นหา"
- Selected student card: สมชาย ใจดี, 650012, ม.1/2, badge "ค้างชำระ ฿4,500"

RIGHT:
Card 1 "ใบแจ้งชำระคงค้าง" — table columns: รายการ, ยอด, ชำระแล้ว, คงเหลือ
Card 2 "บันทึกการชำระ" — form grid:
- จำนวนเงิน (บาท)
- วิธีชำระ: เงินสด / โอนเงิน
- เลขอ้างอิงโอน (disabled unless transfer)
- หมายเหตุ
Buttons: primary amber "บันทึกและออกใบเสร็จ", secondary "บันทึกอย่างเดียว"

Search-first UX. shadcn Form, Input, Select, Table, Button. Light theme. Thai only.
```

---

## Prompt หน้า ใบเสร็จ

```
Receipt preview modal/page for Thai school.

Centered receipt document (max-width 440px), print-friendly white paper look:
- Header: "ใบเสร็จรับเงิน" + school name
- Rows: เลขที่, วันที่, นักเรียน, ชั้น
- Line items table
- Total ฿4,500.00 + Thai text "(สี่พันห้าร้อยบาทถ้วน)"
- วิธีชำระ: เงินสด, ผู้รับเงิน: คุณสมชาย
Buttons: "พิมพ์", "ปิด"

Minimal border, formal but clean — not ornate luxury. Light theme.
```

---

## Prompt หน้า รายงานค้างชำระ

```
Outstanding tuition report page.

Filter bar in a card: dropdowns ทุกชั้น, ทุกห้อง, สถานะค้างชำระ + button "ใช้ตัวกรอง"

Full-width data table with sticky header, striped rows:
Columns: รหัส, ชื่อ, ชั้น, ยอด, ส่วนลด, ต้องชำระ, ชำระแล้ว, คงเหลือ
Mock 3 rows with Thai names. Row with balance > 0 gets amber subtle background + badge "ค้างชำระ". Paid row green badge "ชำระครบ".

Footer: "แสดง 3 จาก 86 · ปี 2568 ภาคเรียนที่ 1"

shadcn Table, Select, Badge. Light school theme.
```

---

## Theme tokens (ใส่ใน globals.css หลัง import จาก v0)

```css
:root {
  --background: 210 40% 98%;        /* #F8FAFC */
  --foreground: 222 47% 11%;
  --card: 0 0% 100%;
  --primary: 205 72% 38%;           /* #1B6CA8 school blue */
  --primary-foreground: 0 0% 100%;
  --accent: 32 95% 44%;             /* amber finance CTA */
  --accent-foreground: 0 0% 100%;
  --muted: 210 40% 96%;
  --border: 214 32% 91%;
  --ring: 205 72% 38%;
  --radius: 0.75rem;
}
```

---

## หลังได้โค้ดจาก v0

```bash
# ใน repo school (เมื่อมี Next.js app แล้ว)
npx shadcn@latest init
npx shadcn@latest add button card input select table badge sidebar form
# วาง component จาก v0 → src/components/
# วาง page → src/app/(dashboard)/...
```

ใน Cursor:

> "Integrate v0 payment page into our tuition spec. Wire Thai labels, year/semester header, match docs/superpowers/specs/2026-05-24-tuition-management-design.md"

---

## สิ่งที่ v0 ทำได้ดี vs ต้องทำเอง

| v0 ทำให้ | ทำเองใน Cursor |
|----------|----------------|
| Layout สวย, component shadcn | Supabase auth + RLS |
| Responsive, spacing | API / server actions |
| Mock data ไทย | Business logic ค่าเทอม |
| Theme สว่าง | URL ?year=&semester= |

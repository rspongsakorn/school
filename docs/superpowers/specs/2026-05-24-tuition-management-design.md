# Design Spec: ระบบจัดการค่าเทอมโรงเรียน

**Date:** 2026-05-24  
**Status:** Draft — pending user review  
**Reference:** [iSchoolSIS demo](https://demopayment.ischoolsis.com/schoolmin/schoolpayment/) (finance/finance)

---

## 1. Overview

Web application for school tuition management used by admin, finance staff, and teachers. Core workflow: manage master data (students, staff), configure fees per academic year/semester, generate invoices, record payments, issue receipts, and run basic collection reports.

### Scope (v1)

| In scope | Out of scope (v2+) |
|----------|-------------------|
| Single school | Multi-tenant / multi-school |
| Admin, finance, teacher roles | Parent/student portal |
| Master + year-scoped data model | Debt collection letters (ใบทวงถาม) |
| Fee rates by grade + additional items | Advanced reports (daily, export Excel) |
| Full / partial payment + outstanding tracking | QR PromptPay, cheques |
| Receipt print + reprint | Per-student discount config page |
| Simple invoice-level discount (% or fixed) | |
| Receipt void with audit log | |
| 2 basic reports | |

### Scale

- 1,000+ students
- Thai UI

### Tech stack

- **Frontend/API:** Next.js App Router, Server Actions
- **Database/Auth:** Supabase PostgreSQL + Supabase Auth + RLS
- **Receipt printing:** HTML print-friendly page (browser print / Ctrl+P)

---

## 2. Architecture

### Approach

**Year-semester context via URL query params** (primary) + **cookie fallback** (remember last selection).

```
?year=2568&semester=1
```

- Shareable links include year and semester
- Cookie stores last selected year/semester for bare `/cms` visits
- Changing year/semester in header updates URL param and cookie

### Route structure

```
/login
/cms                                    → redirect to active year/semester (cookie or default)
/cms/dashboard?year=&semester=
/cms/academic-years                     → admin only (no year param)
/cms/semesters?year=
/cms/grade-levels?year=
/cms/classrooms?year=
/cms/students                           → master list
/cms/enrollments?year=                  → assign students to classrooms
/cms/staff                              → master list
/cms/teacher-assignments?year=
/cms/fee-items                          → master fee item types
/cms/fee-rates?year=&semester=
/cms/receipt-types                      → admin config
/cms/invoices?year=&semester=             → generate / view invoices
/cms/payments?year=&semester=             → record payment (walk-in flow)
/cms/payments/[id]/receipt?year=&semester=
/cms/reports/outstanding?year=&semester=
/cms/reports/collections?year=&semester=
```

### Data layering

```
Master (no year)              Year-scoped                    Junction
────────────────              ───────────                    ────────
students                      academic_years                 student_enrollments
profiles (staff)              semesters                      teacher_assignments
fee_items (types)             grade_levels
receipt_types                 classrooms
                              fee_rates
                              student_invoices
                              invoice_lines
                              payments
                              payment_allocations
                              receipts
                              payment_voids
```

**Principle:** Student and staff records are not duplicated per year. Enrollment and classroom assignment use junction tables scoped to `academic_year_id`.

---

## 3. Data Model

### 3.1 Master tables

#### `students`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| student_code | text UNIQUE | Permanent school ID |
| first_name, last_name | text | |
| id_card | text | Thai national ID (optional) |
| status | enum | active, graduated, transferred, withdrawn |
| created_at, updated_at | timestamptz | |

#### `profiles` (extends Supabase Auth)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | = auth.users.id |
| role | enum | admin, finance, teacher |
| display_name | text | |
| is_active | boolean | |

#### `fee_items`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | e.g. "ค่าเทอม", "ค่าหนังสือ" |
| description | text | optional |
| is_tuition | boolean | true for main tuition item |
| is_active | boolean | |

#### `receipt_types`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| code | text UNIQUE | e.g. "01" |
| name | text | e.g. "ค่าธรรมเนียมการศึกษา" |
| description | text | optional |
| is_active | boolean | |

**Seed:** one default type "01 — ค่าธรรมเนียมการศึกษา"

---

### 3.2 Year-scoped tables

#### `academic_years`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | e.g. "2568" |
| start_date, end_date | date | |
| is_active | boolean | current operational year |

#### `semesters`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| academic_year_id | uuid FK | |
| number | int | 1 or 2 |
| name | text | optional display name |
| start_date, end_date | date | |
| UNIQUE | | (academic_year_id, number) |

#### `grade_levels`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| academic_year_id | uuid FK | |
| name | text | e.g. "ป.1", "ม.1" |
| sort_order | int | |

#### `classrooms`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| academic_year_id | uuid FK | |
| grade_level_id | uuid FK | |
| name | text | e.g. "1/1" |
| UNIQUE | | (academic_year_id, grade_level_id, name) |

#### `fee_rates`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| academic_year_id | uuid FK | |
| semester_id | uuid FK | |
| grade_level_id | uuid FK | |
| fee_item_id | uuid FK | |
| amount | numeric(12,2) | THB |
| receipt_type_id | uuid FK | optional, links to receipt_types |
| UNIQUE | | (academic_year_id, semester_id, grade_level_id, fee_item_id) |

---

### 3.3 Junction tables

#### `student_enrollments`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| student_id | uuid FK | |
| classroom_id | uuid FK | |
| academic_year_id | uuid FK | denormalized for query speed |
| status | enum | enrolled, transferred, withdrawn |
| UNIQUE | | (student_id, academic_year_id) |

#### `teacher_assignments`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| profile_id | uuid FK | staff |
| classroom_id | uuid FK | |
| academic_year_id | uuid FK | |
| role | enum | homeroom, subject |
| UNIQUE | | (profile_id, classroom_id, academic_year_id) |

---

### 3.4 Finance tables

#### `student_invoices`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| student_id | uuid FK | |
| academic_year_id | uuid FK | |
| semester_id | uuid FK | |
| invoice_name | text | e.g. "ภาคเรียนที่ 1/2568" |
| subtotal | numeric(12,2) | sum of lines before discount |
| discount_type | enum | null, percent, fixed |
| discount_value | numeric(12,2) | % or THB amount |
| total_amount | numeric(12,2) | subtotal minus discount |
| paid_amount | numeric(12,2) | denormalized, updated on payment/void |
| status | enum | unpaid, partial, paid |
| created_at | timestamptz | |

**Discount (v1):** Set per invoice at generation time or edited before first payment. No separate student discount config page.

#### `invoice_lines`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| invoice_id | uuid FK | |
| fee_item_id | uuid FK | |
| description | text | |
| amount | numeric(12,2) | |

#### `payments`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| receipt_number | text | auto-increment per academic year |
| student_id | uuid FK | |
| academic_year_id | uuid FK | |
| amount | numeric(12,2) | this transaction |
| payment_method | enum | cash, transfer |
| transfer_reference | text | optional, for bank transfer |
| paid_at | timestamptz | |
| recorded_by | uuid FK | profiles.id |
| note | text | optional |
| status | enum | active, voided |

#### `payment_allocations`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| payment_id | uuid FK | |
| invoice_id | uuid FK | |
| amount | numeric(12,2) | portion applied to this invoice |

#### `receipts`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| payment_id | uuid FK UNIQUE | |
| receipt_number | text | copy from payment |
| receipt_type_id | uuid FK | |
| snapshot_data | jsonb | immutable: student name, lines, amounts, date |
| issued_at | timestamptz | |

#### `payment_voids`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| payment_id | uuid FK | |
| voided_by | uuid FK | profiles.id |
| voided_at | timestamptz | |
| reason | text | required |

Voiding reverses `payment_allocations` effect on `invoice.paid_amount`, sets `payment.status = voided`, does not delete records.

---

### 3.5 Indexes

```sql
-- enrollment lookups
CREATE INDEX idx_enrollments_year_classroom ON student_enrollments(academic_year_id, classroom_id);
CREATE UNIQUE INDEX idx_enrollments_student_year ON student_enrollments(student_id, academic_year_id);

-- payment queries
CREATE INDEX idx_payments_year_date ON payments(academic_year_id, paid_at);
CREATE INDEX idx_invoices_student_year ON student_invoices(student_id, academic_year_id, semester_id);
CREATE INDEX idx_invoices_status ON student_invoices(academic_year_id, status);
```

---

## 4. Key Workflows

### 4.1 Setup (admin)

1. Create academic year and semesters
2. Define grade levels and classrooms for the year
3. Enroll students into classrooms (or bulk import)
4. Assign teachers to classrooms
5. Configure fee rates (tuition + additional items) per grade/semester
6. Configure receipt types (default seeded)

### 4.2 Invoice generation (admin)

1. Select year + semester
2. Choose fee items to include (or all active rates for enrolled students' grades)
3. Batch generate `student_invoices` + `invoice_lines` for all enrolled students
4. Optionally edit per-student discount (percent or fixed amount) before any payment
5. `total_amount = subtotal - discount`

### 4.3 Payment recording (admin / finance)

Walk-in flow (mirrors iSchoolSIS demo):

1. Open `/cms/payments?year=&semester=`
2. Search student by code or name
3. View outstanding invoices
4. Enter amount (full or partial installment)
5. Select payment method: cash or transfer (+ optional reference)
6. Save → create payment, allocations, receipt snapshot
7. Update invoice `paid_amount` and `status`
8. Open print-friendly receipt page

**Invoice status logic:**

- `paid_amount = 0` → unpaid
- `0 < paid_amount < total_amount` → partial
- `paid_amount >= total_amount` → paid

### 4.4 Receipt reprint

- List past payments for a student or by date range
- Open `/cms/payments/[id]/receipt` using immutable `receipts.snapshot_data`

### 4.5 Receipt void (admin / finance)

1. Select active payment
2. Enter void reason (required)
3. Create `payment_voids` record
4. Reverse allocation amounts on affected invoices
5. Set payment status to voided
6. Receipt remains in history, marked voided

---

## 5. Auth & Authorization

### Roles

| Function | Admin | Finance | Teacher |
|----------|-------|---------|---------|
| Manage years, semesters, classrooms | yes | no | no |
| Manage students, enrollments | yes | no | no |
| Configure fee rates, receipt types | yes | no | no |
| Generate invoices | yes | no | no |
| Record payments, issue receipts | yes | yes | no |
| Void receipts | yes | yes | no |
| View reports | yes | yes | yes (own classrooms) |
| View student payment info | yes | yes | yes (own classrooms) |

### Teacher scope

Teachers see only students in classrooms where they have a `teacher_assignments` row for the current year. Enforced in Server Actions and Supabase RLS.

### RLS strategy

- All year-scoped tables: policies check authenticated user role
- Teacher policies: join through `teacher_assignments` → `student_enrollments`
- Finance/admin: full read/write on finance tables for active school

---

## 6. Reports (v1)

### 6.1 Outstanding payments

**Route:** `/cms/reports/outstanding?year=&semester=`

| Column | Source |
|--------|--------|
| รหัสนักเรียน | students.student_code |
| ชื่อ-นามสกุล | students |
| ชั้น / ห้อง | grade_levels, classrooms via enrollment |
| ค่าใช้จ่าย | invoice.subtotal |
| ส่วนลด | computed from discount_type/value |
| ต้องชำระ | invoice.total_amount |
| ชำระแล้ว | invoice.paid_amount |
| ค้างชำระ | total_amount - paid_amount |

**Filters:** grade level, classroom, status (unpaid / partial)

### 6.2 Collection summary by grade

**Route:** `/cms/reports/collections?year=&semester=`

| Column | Source |
|--------|--------|
| ชั้น | grade_levels.name |
| จำนวนนักเรียน | count enrolled |
| ยอดที่ต้องเก็บ | sum(total_amount) |
| ยอดที่เก็บได้ | sum(paid_amount) |
| อัตราการเก็บ (%) | paid / total × 100 |

---

## 7. UI Notes

### Global header

- School name
- Year + semester selector (updates `?year=&semester=` and cookie)
- Current user name + role
- Logout

### Language

- Thai throughout

### Receipt print layout

- School logo and name
- Receipt number, date
- Student name, code, classroom
- Line items with amounts
- Payment method
- Amount in words ( Thai baht text )
- Received by (staff name)

---

## 8. Non-functional requirements

| Requirement | Target |
|-------------|--------|
| Page load (list views) | < 2s for 1,000 students with indexes |
| Concurrent users | 10–20 staff (single school) |
| Data integrity | All payment/void operations in DB transactions |
| Audit | payment_voids, recorded_by on payments |
| Backup | Supabase automated backups |

---

## 9. Comparison with iSchoolSIS demo

| Demo feature | v1 decision |
|-------------|-------------|
| Year/semester selector | Adopted — URL param + cookie (improved over session-only) |
| Fee items by grade | Adopted |
| Invoice generation | Adopted |
| Walk-in payment + receipt | Adopted |
| Receipt types config | Adopted (simplified) |
| Student discount config page | Deferred — simple per-invoice discount instead |
| Receipt void audit | Adopted |
| Debt collection letters | Deferred to v2 |
| Multiple report types | v1: 2 reports only |

---

## 10. Open decisions (resolved)

| Question | Decision |
|----------|----------|
| Single vs multi school | Single school |
| Fee structure | Main tuition by grade/semester + additional items |
| Payment modes | Full + partial with outstanding tracking |
| Receipts | Print immediately + reprint from history |
| Roles | Admin, finance, teacher (read-only, scoped) |
| Reports | Outstanding list + collection summary |
| Payment methods | Cash + bank transfer |
| Tech stack | Next.js App Router + Supabase PostgreSQL |
| Year context | URL param `?year=&semester=` + cookie fallback |
| Discounts | Simple per-invoice % or fixed at generation time |

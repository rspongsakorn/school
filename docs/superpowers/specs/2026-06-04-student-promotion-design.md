# เลื่อนชั้นขึ้นปีการศึกษา (Student Promotion) — Design

วันที่: 2026-06-04

## 1. ปัญหา / เป้าหมาย

ปัจจุบันระบบรองรับข้อมูลหลายปีการศึกษา (นักเรียนเป็น master, ส่วนชั้นเรียน/ห้องเรียน/การลงทะเบียนผูกกับ `semester_id`) แต่ **ไม่มีฟังก์ชันเลื่อนชั้นอัตโนมัติ** เมื่อจบปีการศึกษา แอดมินต้องลงทะเบียนนักเรียนทีละห้องเข้าปีใหม่ด้วยมือ

เป้าหมาย: เพิ่มเครื่องมือ "เลื่อนชั้นขึ้นปีการศึกษา" ให้แอดมินยกนักเรียนทั้งโรงเรียนจากภาคเรียนต้นทางไปลงทะเบียนในภาคเรียนปลายทาง (ปีใหม่) ในขั้นตอนเดียว พร้อมตั้งสถานะ "จบการศึกษา" ให้ชั้นสูงสุด

## 2. ขอบเขต

**ทำ:**
- เลื่อนนักเรียนสถานะ `enrolled` จาก **ภาคเรียนต้นทาง** → **ภาคเรียนปลายทาง**
- จับคู่ชั้นเรียนอัตโนมัติตามลำดับ `sort_order` (ชั้นที่ N → ชั้นที่ N+1) แก้ไขได้
- จับคู่ห้องเรียนตามชื่อที่ตรงกัน ห้องที่จับคู่ไม่ได้ให้แอดมินเลือกเอง/ข้าม
- ชั้นสูงสุด (ไม่มีชั้นถัดไป) → ตั้งสถานะนักเรียนเป็น `graduated`
- preview ก่อนยืนยัน + รายงานผลเป็นจำนวน

**ไม่ทำ (out of scope):**
- ไม่สร้างชั้นเรียน/ห้องเรียนในปีปลายทางให้ (ต้องสร้างไว้ก่อน)
- ไม่แตะค่าเทอม (`fee_rates`) / ใบแจ้งหนี้ (`student_invoices`) — ตั้งค่าปีใหม่แยกตามเดิม
- ไม่ย้าย teacher assignments
- ไม่รองรับ undo/rollback อัตโนมัติ (แต่รันซ้ำได้อย่างปลอดภัย)

## 3. กติกาทางธุรกิจ

1. **แหล่งข้อมูลต้นทาง:** เฉพาะ `student_enrollments` สถานะ `enrolled` ในภาคต้นทาง (ข้าม `transferred`/`withdrawn`)
2. **การจับคู่ชั้น (grade mapping):** เรียงชั้นต้นทางและปลายทางตาม `sort_order` แล้ว map ชั้นต้นทางลำดับที่ `i` → ชั้นปลายทางลำดับที่ `i + 1`
   - ชั้นต้นทางลำดับสุดท้าย (ไม่มี `i + 1`) = **จบการศึกษา** (ไม่มีปลายทาง)
   - แอดมินแก้ไข mapping รายชั้นได้ รวมถึงเปลี่ยนเป็น "จบการศึกษา" หรือ "ข้าม" ด้วยตนเอง
3. **การจับคู่ห้อง (classroom mapping):** ภายในคู่ชั้นที่ map กัน จับคู่ห้องต้นทาง → ห้องปลายทางที่ `name` ตรงกัน (เทียบแบบ trim + ตรงตัว)
   - ห้องต้นทางที่ไม่มีห้องปลายทางชื่อตรงกัน = **ต้องเลือกห้องปลายทางเอง** หรือเลือก "ข้าม"
4. **จบการศึกษา:** นักเรียนในชั้นที่ map เป็น "จบการศึกษา" จะถูกตั้ง `students.status = 'graduated'` และไม่ถูกลงทะเบียนปลายทาง
5. **กันซ้ำ / รันซ้ำได้:** ถ้านักเรียนมี enrollment ในภาคปลายทางอยู่แล้ว (unique `student_id + semester_id`) ให้ **ข้าม** ไม่เขียนทับ และนับเป็น "ลงทะเบียนแล้ว"
6. **เงื่อนไขปลายทาง:** ถ้าภาคปลายทางยังไม่มีชั้นเรียนเลย ระบบไม่อนุญาตให้ทำ และแจ้งให้ไปตั้งค่าโครงสร้างก่อน
7. **สิทธิ์:** เฉพาะ `admin` (ใช้ `requireAdminAction` เหมือน action อื่น)
8. **ต้นทาง ≠ ปลายทาง:** ภาคต้นทางและปลายทางต้องไม่ใช่ภาคเดียวกัน

## 4. สถาปัตยกรรม / องค์ประกอบ

### 4.1 Pure logic — `src/lib/promotion/mapping.ts`
ฟังก์ชันบริสุทธิ์ ทดสอบด้วย unit test (TDD):

```ts
type GradeRef = { id: string; name: string; sortOrder: number };
type ClassroomRef = { id: string; name: string };

// คืน mapping ชั้นต้นทาง -> ชั้นปลายทาง (null = จบการศึกษา)
function mapGradesByOrder(
  source: GradeRef[],
  target: GradeRef[],
): { sourceGradeId: string; targetGradeId: string | null }[];

// คืน mapping ห้องตามชื่อ (null = ไม่พบห้องชื่อตรงกัน)
function mapClassroomsByName(
  source: ClassroomRef[],
  target: ClassroomRef[],
): { sourceClassroomId: string; targetClassroomId: string | null }[];
```

`mapGradesByOrder`: เรียงทั้งสองชุดด้วย `sortOrder` (เสถียร) แล้ว source[i] → target[i+1]; source ตัวสุดท้าย → null
`mapClassroomsByName`: source แต่ละห้อง หา target ที่ `name.trim()` ตรงกัน; ไม่พบ → null

### 4.2 Data layer — `src/lib/data/promotion.ts`
`buildPromotionPlan(sourceSemesterId, targetSemesterId)`:
- ดึงชั้น+ห้องของภาคต้นทาง/ปลายทาง (ใช้ `listGradeLevels`, `listClassroomsByGrade` ที่มีอยู่ หรือ query รวม)
- ดึง roster นักเรียน `enrolled` ของแต่ละห้องต้นทาง
- ดึง enrollment ที่มีอยู่แล้วในภาคปลายทาง (เพื่อ mark "ลงทะเบียนแล้ว")
- ใช้ `mapGradesByOrder` + `mapClassroomsByName` คำนวณ default
- คืนโครงสร้าง `PromotionPlan` สำหรับ UI: รายการคู่ชั้น, คู่ห้อง, จำนวนนักเรียนต่อห้อง, รายการที่จบ, รายการที่จับคู่ห้องไม่ได้, รายการที่ลงทะเบียนแล้ว

### 4.3 Server actions — `src/lib/actions/promotion.ts`
- `getPromotionPreview(sourceSemesterId, targetSemesterId): Promise<PromotionPreviewResult>` — admin-only; เรียก `buildPromotionPlan`; validate ภาคต้นทาง/ปลายทางคนละภาค, ปลายทางมีชั้นเรียน
- `executePromotion(input): Promise<ExecutePromotionResult>` — admin-only; รับแผนที่แอดมิน resolve แล้ว:
  ```ts
  type ExecutePromotionInput = {
    targetSemesterId: string;
    // นักเรียน -> ห้องปลายทาง (เฉพาะที่จะย้าย)
    enrollments: { studentId: string; targetClassroomId: string }[];
    // นักเรียนที่จะตั้งจบการศึกษา
    graduateStudentIds: string[];
  };
  ```
  ขั้นตอน: (1) insert `student_enrollments` แบบ batch (status `enrolled`, ใส่ `academic_year_id`/`semester_id` จากห้องปลายทาง), ข้าม conflict `23505`; (2) update `students.status = 'graduated'` ตาม `graduateStudentIds`; (3) คืนจำนวน `{ enrolled, skipped, graduated }`
  - ลำดับ enroll ก่อน graduate เพื่อให้รันซ้ำปลอดภัย; รายงาน error ชัดเจน
  - revalidate `/registration`, `/students`

> หมายเหตุ: UI เป็นผู้ resolve mapping (ห้องที่จับคู่ไม่ได้/ข้าม/จบ) ให้กลายเป็นรายการ `enrollments` + `graduateStudentIds` ก่อนเรียก `executePromotion` เพื่อให้ action เรียบง่ายและตรวจสอบง่าย

### 4.4 UI
- `src/app/(dashboard)/registration/promote/page.tsx` — render panel
- `src/components/registration/promote-panel.tsx` (`"use client"`):
  - เลือกภาคต้นทาง/ปลายทาง (จากรายการภาคทั้งหมด — ใช้ query ที่มี เช่น `fetchSemestersWithGradeLevels`)
  - กด "สร้างแผนเลื่อนชั้น" → เรียก `getPromotionPreview`
  - ตารางคู่ชั้น (แก้ปลายทาง/จบ/ข้ามได้) + ส่วน resolve ห้องที่จับคู่ไม่ได้ (เลือกห้องปลายทาง หรือข้าม)
  - แถบสรุป: ย้าย X / จบ Y / ต้องเลือกห้อง Z / ลงทะเบียนแล้ว W
  - ปุ่ม "ยืนยันเลื่อนชั้น" (มี AlertDialog ยืนยัน) → เรียก `executePromotion` → toast สรุปผล
  - ปุ่มเข้าหน้านี้จากหน้า "ลงทะเบียน" (`registration-panel.tsx`) เฉพาะ admin
  - ใช้ `useRequireRole(["admin"])`

## 5. การทดสอบ

- **Unit (TDD):** `mapGradesByOrder`, `mapClassroomsByName`
  - ชั้นเท่ากัน N ชั้น → N-1 คู่ + 1 จบ
  - ปลายทางมีชั้นน้อยกว่า/มากกว่าต้นทาง
  - ห้องชื่อตรง/ไม่ตรง/มีช่องว่าง
  - ต้นทางไม่มีห้อง / ปลายทางไม่มีห้อง
- **Action-level:** ตรวจ admin-only, validate ต้นทาง≠ปลายทาง, ปลายทางต้องมีชั้น, ข้าม conflict ซ้ำ
  (เขียนเท่าที่จำเป็นตามแพตเทิร์น `users.test.ts` ที่มีอยู่)

## 6. ความเสี่ยง / หมายเหตุ

- ไม่มี transaction ครอบ DB จริง (ทำใน server action หลายคำสั่ง) — ยอมรับได้เพราะ insert เป็น idempotent (unique constraint) รันซ้ำข้ามรายการเดิม; ถ้า enroll สำเร็จแต่ update จบล้มเหลว รันซ้ำได้
- การจับคู่ชั้นแบบ "ลำดับ +1" สมมติว่าปีปลายทางมีบันไดชั้นเหมือนต้นทาง กรณีต่างกันให้แอดมินแก้ mapping เอง

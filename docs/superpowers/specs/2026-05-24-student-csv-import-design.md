# Design Spec: นำเข้านักเรียนจาก CSV

**Date:** 2026-05-24  
**Status:** Approved (brainstorming)  
**Parent:** [2026-05-24-academic-students-admin-design.md](./2026-05-24-academic-students-admin-design.md)  
**Scope:** ปุ่มนำเข้า CSV บนหน้า `/students` — เพิ่ม master `students` เท่านั้น (ไม่ลงทะเบียนห้อง)

---

## 1. Overview

ให้ admin นำเข้ารายชื่อนักเรียนจากไฟล์ CSV โดยอิงรูปแบบไฟล์ตัวอย่างจริง (`id_card`, `student_code`, `gender`, `first_name`, `last_name`, `birthdate`)

Flow: เปิด dialog → เห็นรูปแบบไฟล์ (key / ความหมาย / ตัวอย่าง) → เลือกไฟล์ → ตรวจสอบ → preview + รายการ error → ยืนยันนำเข้า

---

## 2. Decisions (brainstorming)

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| สิทธิ์ | Admin เท่านั้น |
| รหัสซ้ำในระบบ | ไม่ import — รายงานเป็น **error ละแถว** (แถวอื่นที่ถูกต้อง import ต่อได้) |
| รหัสซ้ำในไฟล์เดียวกัน | **แถวแรก** ที่ผ่าน validation นำเข้าได้ — แถวถัดไปที่รหัสซ้ำ = error |
| Flow หลังเลือกไฟล์ | ตรวจสอบก่อน + สรุป OK/error + รายการ error + **preview สูงสุด 10 แถว** ที่จะนำเข้า → ยืนยัน |
| สถานะหลัง import | `active` (กำลังศึกษา) ทุกคน |
| ปีใน CSV (`birthdate`) | พ.ศ. **2 หลัก** → `2500 + yy` = พ.ศ. เต็ม (เช่น `54` → `2554`) |
| เก็บใน DB | **`date_of_birth` แบบ ISO ค.ศ.** (`YYYY-MM-DD`) — ไม่เก็บ พ.ศ. ใน DB (สอดคล้องฟิลด์วันเกิดที่มีอยู่) |
| คอลัมน์ `gender` ใน CSV | คำนำหน้าไทย → แมปเป็น `male` / `female` |
| แนวทางเทคนิค | Parse CSV ฝั่ง client; **preview + confirm** ผ่าน Server Actions; server **re-validate** ก่อน insert |
| จำกัดขนาด | สูงสุด **500 แถว** ต่อไฟล์ (ไม่รวม header) |

---

## 3. CSV Format

### Headers (บังคับ)

| key | ความหมาย | ตัวอย่าง |
|-----|----------|----------|
| `student_code` | รหัสนักเรียน (unique ในระบบ) | `12390` |
| `first_name` | ชื่อ | `สุพิชชานันท์` |
| `last_name` | นามสกุล | `เจิมกลาง` |
| `gender` | คำนำหน้า/เพศ (แมปเป็น DB) | `เด็กหญิง`, `เด็กชาย` |
| `birthdate` | วันเกิดภาษาไทย, ปี พ.ศ. 2 หลัก | `21 เม.ย. 55` |

### Headers (ไม่บังคับ)

| key | ตัวอย่าง |
|-----|----------|
| `id_card` | `1101000391474` |

### การแมป `gender` → `students.gender`

| ค่าใน CSV (trim, case ตามที่ระบุ) | DB |
|----------------------------------|-----|
| เด็กชาย, นาย | `male` |
| เด็กหญิง, นาง, นางสาว | `female` |
| อื่นๆ | error แถวนั้น |

### การแมป `birthdate`

1. Parse รูปแบบ `D MMM YY` — วัน, เดือนย่อไทย, ปี 2 หลัก  
2. พ.ศ. เต็ม: `2500 + parseInt(yy)` (เช่น `54` → `2554`)  
3. ค.ศ.: `beYear - 543`  
4. เก็บ `date_of_birth` = `YYYY-MM-DD` (local date, ไม่ใช้ timezone shift)

Validation เพิ่มเติม: วันเกิดต้องไม่เป็นวันในอนาคต

### Encoding

- UTF-8  
- แถวแรกเป็น header  
- รองรับค่าที่อยู่ใน double quotes (มาตรฐาน CSV)

---

## 4. UI — `StudentImportDialog`

รายละเอียด phase setup/review: [2026-05-24-student-csv-import-dialog-phases-design.md](./2026-05-24-student-csv-import-dialog-phases-design.md)

### ปุ่ม

- ข้าง「เพิ่มนักเรียน」ใน `StudentsPanel`  
- ข้อความ: **นำเข้า CSV**  
- `isAdmin` เท่านั้น

### Phase `setup` (เปิด dialog / หลังยกเลิก)

- ตาราง **รูปแบบไฟล์** 3 คอลัมน์: **คอลัมน์ (key)** | **ความหมาย** | **ตัวอย่าง** (ตาม §3)  
- ปุ่ม **ดาวน์โหลดไฟล์ตัวอย่าง** — CSV มี header + 1 แถวตัวอย่าง  
- ปุ่ม **เลือกไฟล์ CSV**  
- Footer: **ปิด** เท่านั้น

### Phase `review` (หลังเลือกไฟล์)

- ซ่อนตารางรูปแบบ / ดาวน์โหลด / เลือกไฟล์  
- ขณะตรวจสอบ: ข้อความ "กำลังตรวจสอบ..."  
- ถ้าเกิน 500 แถว หรือ parse ผิด → error ใน review (ยกเลิกเพื่อเลือกไฟล์ใหม่)

**สรุปตัวเลข:** พร้อมนำเข้า N แถว · ผิดพลาด M แถว

**ตาราง error** (scroll): แถวที่ | รหัส (ถ้ามี) | เหตุผลภาษาไทย

**ตารางรายการนำเข้า** (ครบทุกแถวที่พร้อมนำเข้า, scroll):

| รหัส | เลขประชาชน | ชื่อ-นามสกุล | เพศ | วันเกิด (พ.ศ.) |

Footer: **ยกเลิก** (กลับ `setup`, dialog ยังเปิด) | **ปิด** | **ยืนยันนำเข้า** (เมื่อ N > 0)

### หลังยืนยันนำเข้า

- Loading state  
- Toast: `นำเข้า X คนสำเร็จ` (+ ถ้ามี error จาก re-validate: แจ้งเพิ่ม)  
- `router.refresh()`  
- ปิด dialog

---

## 5. Server Actions

### `previewStudentCsvImport(rows: CsvStudentRow[])`

- `requireAdminAction()`  
- Input: แถวดิบจาก CSV (client parse แล้ว)  
- โหลด `student_code` ที่มีใน DB (ชุดเดียว)  
- รัน `validateAndBuildImportRows` (shared lib)  
- Return:

```ts
{
  ok: true;
  stats: { ready: number; errors: number };
  ready: ImportStudentRow[];      // สูงสุดส่งกลับทั้งหมดสำหรับ confirm
  preview: ImportStudentPreview[]; // 10 แถวแรกสำหรับ UI
  errors: ImportRowError[];        // { row, studentCode?, message }
}
```

### `confirmStudentCsvImport(rows: ImportStudentRow[])`

- `requireAdminAction()`  
- **Re-validate** ทุกแถว (รวมรหัสซ้ำใน DB ณ เวลานี้)  
- Bulk insert `students` — `status: 'active'`  
- Return: `{ ok, imported: number, errors: ImportRowError[] }`  
- `revalidatePath('/students')`

Insert แถวละกลุ่มหรือ `insert([...])` — จำกัด batch ถ้าจำเป็น (เช่น 100 ต่อครั้ง)

---

## 6. Shared Library — `csv-import.ts`

| ฟังก์ชัน | หน้าที่ |
|---------|--------|
| `parseCsvText(text)` | แยกแถว/คอลัมน์ CSV |
| `normalizeCsvHeaders(row)` | ตรวจ header บังคับ |
| `mapGenderLabel(label)` | เด็กหญิง → female, … |
| `parseThaiBirthdateShort(text)` | `21 เม.ย. 54` → ISO date |
| `validateAndBuildImportRows(rows, existingCodes)` | logic ซ้ำในไฟล์ + แมปฟิลด์ |

`csv-format.ts`: `CSV_FORMAT_TABLE`, `SAMPLE_CSV_CONTENT` สำหรับ UI และดาวน์โหลด

---

## 7. Error Handling

| กรณี | พฤติกรรม |
|------|----------|
| ไฟล์ไม่ใช่ CSV / อ่านไม่ได้ | Toast error, ไม่เข้า preview |
| Header ไม่ครบ | Error ทั้งไฟล์ พร้อมรายการคอลัมน์ที่ขาด |
| > 500 แถว | Error ทั้งไฟล์ |
| Preview แล้วไม่มีแถวพร้อมนำเข้า | ปุ่มยืนยัน disabled |
| Race: รหัสซ้ำระหว่าง preview กับ confirm | แถวนั้นไม่ insert, รายงานใน errors ของ confirm |

---

## 8. Out of Scope (YAGNI)

- อัปเดตนักเรียนเดิมจาก CSV  
- ลงทะเบียนห้องเรียน (`student_enrollments`)  
- รองรับ `.xlsx`  
- คอลัมน์ `status` ใน CSV  
- Import โดย finance/teacher  

---

## 9. Testing

| ไฟล์ | ครอบคลุม |
|------|----------|
| `csv-import.test.ts` | parse วันที่, ปี 54→2554→ISO, แมปเพศ, ซ้ำในไฟล์, header ขาด |
| Manual | ไฟล์ `csvvvv.csv`, รหัสซ้ำในระบบ, ยืนยันแล้วตารางอัปเดต |

---

## 10. Implementation Files (checklist)

- [ ] `src/lib/students/csv-format.ts`
- [ ] `src/lib/students/csv-import.ts` + tests
- [ ] `src/lib/actions/students.ts` — preview + confirm actions
- [ ] `src/components/students/student-import-dialog.tsx`
- [ ] `src/components/students/students-panel.tsx` — ปุ่ม

---

## 11. Success Criteria

1. Admin กด「นำเข้า CSV」เห็นตารางรูปแบางไฟล์และดาวน์โหลดตัวอย่างได้  
2. อัปโหลดไฟล์รูปแบบตัวอย่าง → preview + errors ถูกต้อง  
3. ยืนยันแล้วนักเรียนใหม่ปรากฏในตาราง สถานะกำลังศึกษา  
4. รหัสซ้ำในระบบ/ในไฟล์ (แถวหลัง) อยู่ในรายการ error ไม่ถูก insert  
5. วันเกิดจาก `54` เก็บใน DB เป็นค.ศ. ISO ที่ถูกต้อง

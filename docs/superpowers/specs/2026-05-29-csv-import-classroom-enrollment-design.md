# CSV Import — Auto-Create Classroom + Enroll Student

วันที่: 2026-05-29
สถานะ: ออกแบบเสร็จ รอ implement

## 1. ที่มาและเป้าหมาย

ปัจจุบันการนำเข้านักเรียนจาก CSV เพิ่มเฉพาะข้อมูลใน `students` table โดยไม่มีการลงทะเบียนเข้าห้องเรียน ผู้ใช้ต้องไปลงทะเบียนทีละคนผ่านหน้า registration หลังจาก import แล้ว — งานซ้ำซ้อน

ในหลายๆ กรณีโรงเรียนรู้ห้องเรียนของนักเรียนล่วงหน้าอยู่แล้ว (เช่น รายชื่อแบ่งห้องจากครูประจำชั้น) ต้องการให้ระบบ:

- รับคอลัมน์ `classroom` ใน CSV เพื่อระบุห้อง
- ถ้าชั้น/ห้องยังไม่มีในระบบ → สร้างให้อัตโนมัติ
- ลงทะเบียนนักเรียนเข้าห้องในภาคเรียนปัจจุบัน

## 2. ขอบเขต

In-scope:
- เพิ่มคอลัมน์ `classroom` ใน CSV (optional ทั้ง column-level และ row-level)
- Parse format "ชั้น/เลขห้อง" (split "/" ตัวแรก)
- Auto-create `grade_levels` + `classrooms` ใน semester ปัจจุบันถ้ายังไม่มี
- Enroll นักเรียนเข้า `student_enrollments` ด้วย status `enrolled`
- Preview ใน dialog แสดง "ห้องเรียนที่จะสร้างใหม่"
- ใช้ semester ปัจจุบันจาก page context

Out-of-scope:
- ไม่รองรับคอลัมน์ `semester_id` ใน CSV — ใช้แค่ semester ปัจจุบันเสมอ
- ไม่รองรับการ enroll นักเรียนที่มีอยู่แล้วผ่าน CSV (ยังคงเป็น row error ตามเดิม)
- ไม่สนับสนุนการแก้ห้องเรียน (move classroom) ผ่าน CSV
- ไม่แตะ flow registration page เดิม

## 3. CSV Format Changes

### 3.1 New optional column

```
id_card,student_code,gender,first_name,last_name,birthdate,classroom
```

- **classroom**: ไม่บังคับ ทั้งใน header (ไฟล์เก่าไม่มีก็ใช้ต่อได้) และในค่า (เว้นว่างได้)
- ค่าตัวอย่าง: `ม.2/1`, `ป.6/2`, `อ.1/3`

### 3.2 Parsing rules

`parseClassroomCell(raw: string)`:

| Input | Output |
|---|---|
| `""` หรือ `"   "` | `{ ok: true, empty: true }` |
| `"ม.2/1"` | `{ ok: true, empty: false, gradeName: "ม.2", classroomNumber: "1" }` |
| `"ม.2"` (ไม่มี "/") | `{ ok: false, error: "ต้องระบุในรูปแบบ ชั้น/เลขห้อง" }` |
| `"/1"` (ไม่มีชั้น) | `{ ok: false, error: "ขาดชื่อชั้นเรียน" }` |
| `"ม.2/"` (ไม่มีเลขห้อง) | `{ ok: false, error: "เลขห้องต้องเป็นตัวเลข 1–999" }` |
| `"ม.2/abc"` | `{ ok: false, error: "เลขห้องต้องเป็นตัวเลข 1–999" }` |
| `"ม.2/0"` หรือ `"ม.2/1000"` | `{ ok: false, error: "เลขห้องต้องเป็นตัวเลข 1–999" }` |
| `"ม.2/1/2"` | split ตัวแรก → `gradeName: "ม.2"`, `classroomNumber: "1/2"` → error เลขห้อง |

- ใช้ `validateClassroomNumber` ที่มีอยู่ — ตัวเลข 1–999 เท่านั้น
- ใช้ `validateGradeLevelName` ที่มีอยู่ — ไม่ว่างเป็นพอ

### 3.3 Sample CSV updated

```csv
id_card,student_code,gender,first_name,last_name,birthdate,classroom
1101000391474,12390,เด็กหญิง,สุพิชชานันท์,เจิมกลาง,"21 เม.ย. 55",ม.2/1
,12391,เด็กชาย,ก,ข,"15 พ.ค. 55",
,12392,เด็กชาย,ค,ง,"01 มิ.ย. 55",ป.6/2
```

แถว 12391 ไม่ระบุ classroom → เพิ่มเฉพาะ student record ไม่ลงทะเบียน

## 4. Server Action Changes

### 4.1 `previewStudentCsvImport`

เปลี่ยน signature:
```ts
previewStudentCsvImport(rows, semesterId: string | null)
```

ขั้นตอน:
1. ถ้า `semesterId == null` แต่ในไฟล์มีค่า classroom → error "ต้องตั้งภาคเรียนปัจจุบันก่อนใช้คอลัมน์ classroom"
2. parse classroom ต่อแถว → คอลัมน์ใหม่ใน `CsvStudentInputRow`: `classroom?: string`
3. validate + parse ผ่าน `parseClassroomCell` → ถ้า error → row error เดิม (skip ทั้งแถว ไม่ insert student)
4. load existing `grade_levels` + `classrooms` ใน semester
5. ประมวลผลรายการที่ valid:
   - คำนวณ `newGradeLevels[]` = ชั้นที่ปรากฏใน CSV แต่ยังไม่มีใน semester (unique)
   - คำนวณ `newClassrooms[]` = ห้องที่ปรากฏใน CSV แต่ยังไม่มีในชั้นนั้น (unique; รวมห้องที่ต้องอยู่ในชั้นที่กำลังจะสร้างใหม่ด้วย)
   - คำนวณ `enrollmentByCode: Map<string, { gradeName, classroomNumber }>` สำหรับขั้นตอนสร้าง enrollment ภายหลัง
6. ขยาย return shape:
   ```ts
   {
     ok: true,
     stats: { ready, errors, willEnroll, willCreateClassrooms },
     ready, preview, errors,
     newGradeLevels: { name: string }[],
     newClassrooms: { gradeName: string; number: string; gradeIsNew: boolean }[],
   }
   ```

### 4.2 `confirmStudentCsvImport`

เปลี่ยน signature:
```ts
confirmStudentCsvImport(rows, classroomMap: Record<student_code, { gradeName, classroomNumber }>, semesterId: string | null)
```

ลำดับ DB ops:

1. **Validate rows อีกครั้ง** (เหมือนเดิม — guard against tampering)
2. **ถ้ามี classroom ใน input:**
   a. โหลด grade_levels ใน semester → คำนวณชั้นที่ยังไม่มี
   b. Bulk-insert grade_levels ที่ขาด (ใช้ `INSERT ... ON CONFLICT DO NOTHING` ผ่าน upsert with `onConflict`)
   c. โหลด classrooms ใน semester (รวมที่เพิ่งสร้าง) → คำนวณห้องที่ยังไม่มี
   d. Bulk-insert classrooms ที่ขาด (ใช้ upsert เช่นกัน)
   e. โหลดอีกครั้งให้ได้ map `key → classroom_id`
3. **Insert students** (chunked เหมือนเดิม)
4. **Insert student_enrollments** สำหรับนักเรียนที่ insert สำเร็จและมี classroom
   - ใช้ student_id ที่ได้กลับมาจาก insert step 3
   - ถ้าขั้นนี้ fail → student insert ค้างอยู่ แต่ไม่มี enrollment → return partial error
5. Revalidate paths: `/students`, `/registration`

### 4.3 Idempotency / safety

- ขั้นที่ 2.b + 2.d ใช้ unique constraints ที่มีอยู่:
  - `grade_levels`: `(semester_id, name)` — โครงสร้างปัจจุบันมีแน่นอนเพราะ create มี check 23505
  - `classrooms`: `(grade_level_id, name)` — เช่นกัน
- ถ้ามี process อื่นสร้างชั้น/ห้องพร้อมกัน → upsert ON CONFLICT จะข้ามให้
- Race condition: ถ้า insert students สำเร็จแต่ enrollments fail → ไม่ rollback (Supabase JS ไม่มี multi-statement tx) แต่จะ return clear error ให้ผู้ใช้ retry/manual cleanup ได้

## 5. UI Changes

### 5.1 `StudentImportDialog`

**Props ใหม่:** `semesterId: string | null`

**Setup phase:**
- เพิ่มข้อความ "ลงทะเบียนเข้า: [ภาคเรียนที่ X/YYYY]" (อ่านจาก context)
- ถ้า `!semesterId` → ปุ่ม "เลือกไฟล์" disabled + แสดง warning

**Review phase — Preview section ขยาย:**
- คอลัมน์ "ห้องเรียน" เพิ่มในตาราง preview (แสดง "—" ถ้าไม่มี)
- Section ใหม่เหนือตาราง:
  ```
  📦 ห้องเรียนที่จะสร้างใหม่ (N ห้อง)
  ┌─────────┬──────┐
  │ ชั้น     │ ห้อง  │
  │ ม.2     │ 1    │
  │ ม.2     │ 3    │
  │ ป.6     │ 2    │
  └─────────┴──────┘
  ```
- Badge "ใหม่" ข้างชื่อชั้น/ห้องที่ยังไม่มีในระบบ

**Stats ขยาย:**
- "พร้อมนำเข้า X แถว · ลงทะเบียน Y คน · สร้างห้องใหม่ Z ห้อง"

### 5.2 Students page

หา component ที่ render `StudentImportDialog` (students panel) → ส่ง `semesterId` จาก `useSemesterContext`

### 5.3 csv-format.ts

เพิ่มแถวใน `CSV_FORMAT_TABLE`:
```ts
{
  key: "classroom",
  description: "ห้องเรียน — ชั้น/เลขห้อง (ไม่บังคับ; ถ้าระบุจะลงทะเบียนให้อัตโนมัติ)",
  example: "ม.2/1",
}
```

อัปเดต `SAMPLE_CSV_CONTENT` เพิ่มคอลัมน์ + ตัวอย่าง

## 6. Pure Helper + Tests

### 6.1 `parseClassroomCell` (ใหม่ใน `csv-import.ts`)

```ts
export type ParsedClassroom =
  | { ok: true; empty: true }
  | { ok: true; empty: false; gradeName: string; classroomNumber: string }
  | { ok: false; error: string };

export function parseClassroomCell(raw: string): ParsedClassroom;
```

### 6.2 Tests ที่ต้องเพิ่ม

`src/lib/students/csv-import.test.ts`:
- `parseClassroomCell` — 7 cases ตามตารางใน 3.2
- `validateAndBuildImportRows` — เพิ่ม case: classroom valid, classroom empty, classroom invalid → row error
- `csvRowsToObjects` — รับ classroom column

## 7. Edge Cases

| สถานการณ์ | พฤติกรรม |
|---|---|
| ไฟล์เก่าไม่มี header `classroom` | ใช้ได้ปกติ ไม่ enroll ใคร |
| classroom column มี แต่ทุกแถวว่าง | ใช้ได้ปกติ ไม่ enroll ใคร |
| classroom ผิด format ในแถวเดียว | error เฉพาะแถวนั้น แถวอื่นผ่าน |
| `student_code` ซ้ำกับใน DB | row error ตามเดิม (classroom ของแถวนี้ถูกข้าม) |
| 5 แถวบอกห้อง "ม.2/1" | สร้างห้องครั้งเดียว enroll 5 คน |
| `semesterId == null` + ไฟล์มี classroom | block import ทั้งไฟล์ |
| `semesterId == null` + ไฟล์ไม่มี classroom | ใช้ได้ (เพิ่มเฉพาะนักเรียน) |
| insert students สำเร็จ แต่ enrollments fail | partial — students อยู่ใน DB, enrollments ไม่อยู่; report error ให้ผู้ใช้ |

## 8. Acceptance criteria

- ไฟล์ CSV เดิมไม่มีคอลัมน์ `classroom` → ใช้ import เหมือนเดิมทุกประการ
- ไฟล์ CSV ใหม่มี `classroom` กรอกครบ → นักเรียนถูกเพิ่ม + enroll พร้อมกัน + ห้องที่ขาดถูกสร้าง
- ไฟล์ CSV ใหม่มี `classroom` กรอกบางแถว → enroll เฉพาะแถวที่กรอก
- Preview แสดงห้องใหม่ที่จะสร้าง ก่อนกดยืนยัน
- ห้องที่มีอยู่ใน DB → ไม่สร้างซ้ำ enroll นักเรียนใหม่เข้าได้
- Format ผิดในแถวใด → แสดง error ระบุแถวพร้อมเหตุผล

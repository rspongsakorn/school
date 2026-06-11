# คัดลอกโครงสร้างภาคเรียน — เพิ่มทางเลือก "คัดลอกพร้อมนักเรียน"

วันที่: 2026-06-11

## ที่มา

หน้า "ลงทะเบียน" มีปุ่มคัดลอกโครงสร้างจากภาคเรียนอื่น (เช่น ภาค 1 → ภาค 2)
ปัจจุบัน `copySemesterStructure` คัดลอกเฉพาะ `grade_levels` + `classrooms`
ไม่รวมนักเรียน (UI ระบุ "ไม่รวมนักเรียน")

ผู้ใช้ต้องการให้มี **2 ทางเลือก**:

1. คัดลอกแต่โครงสร้าง (พฤติกรรมเดิม)
2. คัดลอกพร้อมลงทะเบียนนักเรียนเข้าห้องเดิม

เนื่องจาก sem1 → sem2 เป็น **ปีการศึกษาเดียวกัน ชั้นเดิม ชื่อห้องเดิม**
การยกนักเรียนคือ "carry forward" ตรง ๆ ไม่ใช่การเลื่อนชั้น (promotion)

## ขอบเขต

- ยกเฉพาะนักเรียนสถานะ `enrolled` เท่านั้น (คนลาออก/ย้าย/พักการเรียน ไม่ยกมา)
- ไม่เปลี่ยนชั้น/ห้อง — นักเรียนอยู่ห้องชื่อเดิมในภาคปลายทาง
- ไม่แตะ invoice/payment — แค่สร้าง enrollment เข้าห้อง
- ทำงานได้เฉพาะเมื่อภาคปลายทาง **ยังว่าง** (ไม่มีชั้นเรียน) ตามเงื่อนไขเดิมของฟังก์ชัน

## การออกแบบ

### 1. Backend — `src/lib/actions/semester-structure.ts`

ขยาย `copySemesterStructure`:

```
copySemesterStructure(
  sourceSemesterId: string,
  targetSemesterId: string,
  includeStudents: boolean,
): Promise<ActionState & { enrolledCount?: number }>
```

- การตรวจสอบสิทธิ์/เงื่อนไขเดิมคงไว้ (auth, ปีเดียวกัน, ภาคปลายทางว่าง, ภาคต้นทางมีชั้นเรียน)
- ตอน insert `classrooms` ของแต่ละชั้น เปลี่ยนเป็น `.select("id, name")`
  เพื่อสร้าง mapping **ชื่อห้องต้นทาง → id ห้องปลายทาง** (ภายในชั้นนั้น)
- ถ้า `includeStudents === true`:
  - สำหรับแต่ละห้องต้นทาง ดึง `student_enrollments` ที่ `status = "enrolled"`
    (เลือก `student_id`, `classroom_id`)
  - แมป `classroom_id` ต้นทาง → id ห้องปลายทาง ผ่าน mapping ชื่อห้อง
  - รวบ enrollment rows ทั้งหมดเป็น **insert เดียว** ตอนท้าย:
    `{ student_id, classroom_id (ปลายทาง), academic_year_id, semester_id (ปลายทาง), status: "enrolled" }`
  - ไม่ชน unique constraint `(student_id, semester_id)` เพราะภาคปลายทางว่างอยู่แล้ว
  - นับจำนวน rows ที่ insert แล้ว return เป็น `enrolledCount`
- ถ้า `includeStudents === false`: พฤติกรรมเหมือนเดิม (`enrolledCount` ไม่ต้องส่ง หรือ 0)

ประสิทธิภาพ: ดึง enrollment ของห้องต้นทางเป็น batch (`.in("classroom_id", sourceClassroomIds)`)
แล้ว insert ครั้งเดียว แทนการ loop ทีละห้อง

### 2. Frontend — `src/components/registration/registration-panel.tsx`

- แก้ข้อความ hint: ตัด "(ไม่รวมนักเรียน)" ออก
- หลังเลือกภาคต้นทาง แสดง **2 ปุ่มแยกกัน**:
  - `คัดลอกแต่โครงสร้าง` — variant `secondary`, เรียก `copySemesterStructure(..., false)` กดทำเลย
  - `คัดลอกพร้อมนักเรียน` — variant เด่นกว่า (default), มี **confirm dialog** ยืนยันก่อน
    เมื่อยืนยันจึงเรียก `copySemesterStructure(..., true)`
- toast หลังสำเร็จ:
  - โครงสร้างเปล่า → "คัดลอกโครงสร้างแล้ว" (เดิม)
  - พร้อมนักเรียน → "คัดลอกพร้อมนักเรียน {enrolledCount} คน"
- ทั้งสองปุ่ม disabled ระหว่าง pending และเมื่อยังไม่ได้เลือกภาคต้นทาง

## การทดสอบ

- คัดลอกแต่โครงสร้าง: ภาคปลายทางได้ชั้น/ห้องครบ ไม่มี enrollment
- คัดลอกพร้อมนักเรียน: นักเรียน `enrolled` ในแต่ละห้องต้นทางปรากฏในห้องชื่อเดิมของภาคปลายทาง
- นักเรียนสถานะอื่น (ลาออก/ย้าย/พัก) ไม่ถูกยกมา
- เงื่อนไขเดิมยังบล็อกถูก: ภาคปลายทางมีชั้นแล้ว, คนละปีการศึกษา, ภาคเดียวกัน

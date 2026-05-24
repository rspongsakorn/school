export const CSV_IMPORT_MAX_ROWS = 500;

export const CSV_REQUIRED_HEADERS = [
  "student_code",
  "first_name",
  "last_name",
  "gender",
  "birthdate",
] as const;

export const CSV_FORMAT_TABLE = [
  {
    key: "student_code",
    description: "รหัสนักเรียน (ไม่ซ้ำในระบบ)",
    example: "12390",
  },
  {
    key: "first_name",
    description: "ชื่อ",
    example: "สุพิชชานันท์",
  },
  {
    key: "last_name",
    description: "นามสกุล",
    example: "เจิมกลาง",
  },
  {
    key: "gender",
    description: "เด็กชาย / เด็กหญิง (แมปเป็นเพศในระบบ)",
    example: "เด็กหญิง",
  },
  {
    key: "birthdate",
    description: "วันเกิด — วัน เดือนย่อไทย ปี พ.ศ. 2 หลัก",
    example: "21 เม.ย. 55",
  },
  {
    key: "id_card",
    description: "เลขบัตรประชาชน (ไม่บังคับ)",
    example: "1101000391474",
  },
] as const;

export const SAMPLE_CSV_CONTENT = [
  "id_card,student_code,gender,first_name,last_name,birthdate",
  '1101000391474,12390,เด็กหญิง,สุพิชชานันท์,เจิมกลาง,"21 เม.ย. 55"',
].join("\n");

export const SAMPLE_CSV_FILENAME = "student-import-sample.csv";

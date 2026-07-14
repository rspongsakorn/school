export const CSV_FORMAT_TABLE = [
  {
    key: "student_code",
    description: "รหัสนักเรียน",
    example: "14333",
  },
  {
    key: "first_name",
    description: "ชื่อ",
    example: "นาลันทา",
  },
  {
    key: "last_name",
    description: "นามสกุล",
    example: "ศรีวัฒนพงศ์",
  },
  {
    key: "amount",
    description: "ยอดชำระ (บาท)",
    example: "3600",
  },
  {
    key: "paid_date",
    description: "วันที่ชำระ — พ.ศ. วว/ดด/ปปปป",
    example: "06/05/2569",
  },
] as const;

export const SAMPLE_CSV_CONTENT = [
  "student_code,first_name,last_name,amount,paid_date",
  "14333,นาลันทา,ศรีวัฒนพงศ์,3600,06/05/2569",
  "14399,อลิสา,มูลทา,2000,12/05/2569",
].join("\n");

export const SAMPLE_CSV_FILENAME = "payment-import-sample.csv";

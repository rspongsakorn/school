export const recentPayments = [
  {
    id: "PAY-2568-0847",
    name: "ด.ช. ณัฐพล วงศ์สุวรรณ",
    grade: "ป.4/2",
    amount: 8500,
    date: "24 พ.ค. 2568",
    status: "ชำระแล้ว" as const,
  },
  {
    id: "PAY-2568-0846",
    name: "ด.ญ. พิมพ์ชนก รัตนโชติ",
    grade: "ป.2/1",
    amount: 7500,
    date: "24 พ.ค. 2568",
    status: "ชำระแล้ว" as const,
  },
  {
    id: "PAY-2568-0845",
    name: "ด.ช. ภูมิพัฒน์ จันทร์เจริญ",
    grade: "ป.6/3",
    amount: 9500,
    date: "23 พ.ค. 2568",
    status: "ชำระแล้ว" as const,
  },
  {
    id: "PAY-2568-0844",
    name: "ด.ญ. ชญานิศ ศรีประเสริฐ",
    grade: "ป.1/2",
    amount: 7500,
    date: "23 พ.ค. 2568",
    status: "ชำระแล้ว" as const,
  },
  {
    id: "PAY-2568-0843",
    name: "ด.ช. กฤตภาส อัครพงศ์",
    grade: "ป.5/1",
    amount: 8500,
    date: "22 พ.ค. 2568",
    status: "ชำระแล้ว" as const,
  },
];

export const overdueStudents = [
  {
    name: "ด.ช. วรากร พิทักษ์ธรรม",
    grade: "ป.3/1",
    dueDate: "15 พ.ค. 2568",
    amount: 8500,
    daysOverdue: 9,
  },
  {
    name: "ด.ญ. ณัฐณิชา เจริญสุข",
    grade: "ป.4/3",
    dueDate: "10 พ.ค. 2568",
    amount: 8500,
    daysOverdue: 14,
  },
  {
    name: "ด.ช. ธนกฤต มั่นคง",
    grade: "ป.2/2",
    dueDate: "5 พ.ค. 2568",
    amount: 7500,
    daysOverdue: 19,
  },
];

export const gradeStats = [
  { grade: "ป.1", rate: 90.3, paid: 168, total: 186 },
  { grade: "ป.2", rate: 88.4, paid: 175, total: 198 },
  { grade: "ป.3", rate: 85.8, paid: 182, total: 212 },
  { grade: "ป.4", rate: 88.0, paid: 198, total: 225 },
  { grade: "ป.5", rate: 86.7, paid: 189, total: 218 },
  { grade: "ป.6", rate: 84.7, paid: 177, total: 209 },
];

export function formatBaht(amount: number) {
  return `฿${amount.toLocaleString("th-TH")}`;
}

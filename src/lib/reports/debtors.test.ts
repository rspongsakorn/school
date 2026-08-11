import { describe, it, expect } from "vitest";
import { summarizeEnrollments, buildDebtorRows, splitDebtorTotals } from "./debtors";

const enrollments = [
  {
    studentId: "s1",
    status: "enrolled" as const,
    roomLabel: "ปวช.1/1",
    termLabel: "1/2568",
    sortKey: "2568-05-01#1",
  },
  {
    studentId: "s1",
    status: "enrolled" as const,
    roomLabel: "ปวช.2/1",
    termLabel: "1/2569",
    sortKey: "2569-05-01#1",
  },
];

describe("summarizeEnrollments", () => {
  it("takes the room and status from the latest term and the first term as the entry year", () => {
    const result = summarizeEnrollments(enrollments);

    expect(result.get("s1")).toEqual({
      roomLabel: "ปวช.2/1",
      status: "enrolled",
      firstTermLabel: "1/2568",
    });
  });

  it("keeps the last room of a student who has since left", () => {
    const result = summarizeEnrollments([
      ...enrollments,
      {
        studentId: "s2",
        status: "withdrawn" as const,
        roomLabel: "ปวช.1/1",
        termLabel: "1/2568",
        sortKey: "2568-05-01#1",
      },
    ]);

    expect(result.get("s2")).toEqual({
      roomLabel: "ปวช.1/1",
      status: "withdrawn",
      firstTermLabel: "1/2568",
    });
  });
});

describe("buildDebtorRows", () => {
  const students = [
    { studentId: "s1", studentCode: "6820201002", studentName: "น.ส.กรรณิการ์ ทัศสำราญ" },
    { studentId: "s2", studentCode: "6820201003", studentName: "น.ส.กฤติยากรณ์ พูนสวัสดิ์" },
  ];

  it("sums every invoice of a student across all academic years", () => {
    const rows = buildDebtorRows({
      students,
      enrollments: summarizeEnrollments(enrollments),
      invoices: [
        { studentId: "s1", totalAmount: 4550, paidAmount: 4550 },
        { studentId: "s1", totalAmount: 4550, paidAmount: 500 },
      ],
    });

    expect(rows[0]).toMatchObject({
      studentCode: "6820201002",
      totalAmount: 9100,
      paidAmount: 5050,
      outstanding: 4050,
      firstTermLabel: "1/2568",
      roomLabel: "ปวช.2/1",
    });
  });

  it("still lists a student with no invoices at all", () => {
    const rows = buildDebtorRows({
      students,
      enrollments: summarizeEnrollments(enrollments),
      invoices: [],
    });

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ studentCode: "6820201003", totalAmount: 0, outstanding: 0 });
  });

  it("never reports a negative outstanding when a student overpaid", () => {
    const rows = buildDebtorRows({
      students: [students[0]],
      enrollments: summarizeEnrollments(enrollments),
      invoices: [{ studentId: "s1", totalAmount: 4550, paidAmount: 5000 }],
    });

    expect(rows[0].outstanding).toBe(0);
  });

  it("sorts by student code", () => {
    const rows = buildDebtorRows({
      students: [students[1], students[0]],
      enrollments: summarizeEnrollments(enrollments),
      invoices: [],
    });

    expect(rows.map((r) => r.studentCode)).toEqual(["6820201002", "6820201003"]);
  });
});

describe("splitDebtorTotals", () => {
  it("totals the enrolled and the departed students separately", () => {
    const rows = [
      { status: "enrolled" as const, totalAmount: 4550, paidAmount: 4550, outstanding: 0 },
      { status: "enrolled" as const, totalAmount: 4550, paidAmount: 500, outstanding: 4050 },
      { status: "withdrawn" as const, totalAmount: 4550, paidAmount: 0, outstanding: 4550 },
    ];

    const totals = splitDebtorTotals(rows);

    expect(totals.enrolled).toEqual({ totalAmount: 9100, paidAmount: 5050, outstanding: 4050 });
    expect(totals.departed).toEqual({ totalAmount: 4550, paidAmount: 0, outstanding: 4550 });
    expect(totals.all).toEqual({ totalAmount: 13650, paidAmount: 5050, outstanding: 8600 });
  });
});

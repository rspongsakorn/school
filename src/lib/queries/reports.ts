import { createClient } from "@/lib/supabase/client";
import { formatClassroom, formatStudentName, formatThaiTime, formatThaiDate } from "@/lib/format";
import { bangkokDateKey } from "@/lib/reports/date";
import { groupDailyRevenue, type DailyRevenueRow } from "@/lib/reports/daily";
import { latestPaidAtByInvoice } from "@/lib/reports/last-paid";

export type OutstandingReportRow = {
  invoiceId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: "unpaid" | "partial" | "paid";
  isReimbursable: boolean;
  invoiceTypeName: string;
  issuedAt: string;
  lastPaidAt: string | null;
  discountType: "fixed" | "percent" | null;
  discountValue: number | null;
};

export type CollectionsReportRow = {
  gradeName: string;
  studentCount: number;
  totalDue: number;
  totalPaid: number;
  ratePercent: number;
};

/** Inline browser-client version of getStudentGradeMap (avoids server-only import) */
async function getStudentGradeMap(semesterId: string): Promise<Map<string, string>> {
  const supabase = createClient();

  type EnrollmentRow = {
    student_id: string;
    classrooms: { name: string; grade_levels: { name: string } | null } | null;
  };

  const { data } = await supabase
    .from("student_enrollments")
    .select(
      `
      student_id,
      classrooms (
        name,
        grade_levels ( name )
      )
    `,
    )
    .eq("semester_id", semesterId)
    .eq("status", "enrolled");

  const map = new Map<string, string>();

  for (const row of (data ?? []) as unknown as EnrollmentRow[]) {
    const classroom = row.classrooms;
    const gradeName = classroom?.grade_levels?.name ?? null;
    map.set(row.student_id, formatClassroom(gradeName, classroom?.name ?? null));
  }

  return map;
}

export async function fetchOutstandingReport(params: {
  semesterId: string;
  academicYearId: string;
  gradeLevelId?: string;
  classroomId?: string;
  status?: "unpaid" | "partial" | "paid" | "all";
  variant?: "standard" | "reimbursable" | "all";
  invoiceTypeId?: string;
  teacherProfileId?: string;
  includeAllStatuses?: boolean;
}): Promise<OutstandingReportRow[]> {
  const supabase = createClient();
  const gradeByStudent = await getStudentGradeMap(params.semesterId);

  let allowedStudentIds: string[] | null = null;

  if (params.teacherProfileId) {
    const { data: assignments } = await supabase
      .from("teacher_assignments")
      .select("classroom_id")
      .eq("profile_id", params.teacherProfileId)
      .eq("semester_id", params.semesterId);

    const classroomIds = (assignments ?? []).map((a) => a.classroom_id);
    if (classroomIds.length === 0) return [];

    const { data: enrollments } = await supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("semester_id", params.semesterId)
      .in("classroom_id", classroomIds);

    allowedStudentIds = (enrollments ?? []).map((e) => e.student_id);
    if (allowedStudentIds.length === 0) return [];
  }

  if (params.gradeLevelId || params.classroomId) {
    let enrollmentQuery = supabase
      .from("student_enrollments")
      .select("student_id, classrooms!inner(grade_level_id)")
      .eq("semester_id", params.semesterId)
      .eq("status", "enrolled");

    if (params.classroomId) {
      enrollmentQuery = enrollmentQuery.eq("classroom_id", params.classroomId);
    } else if (params.gradeLevelId) {
      enrollmentQuery = enrollmentQuery.eq("classrooms.grade_level_id", params.gradeLevelId);
    }

    const { data: filtered } = await enrollmentQuery;
    const ids = (filtered ?? []).map((e) => e.student_id);

    allowedStudentIds = allowedStudentIds
      ? allowedStudentIds.filter((id) => ids.includes(id))
      : ids;

    if (allowedStudentIds.length === 0) return [];
  }

  let query = supabase
    .from("student_invoices")
    .select(
      `
      id,
      student_id,
      subtotal,
      total_amount,
      paid_amount,
      status,
      is_reimbursable,
      created_at,
      discount_type,
      discount_value,
      invoice_types ( name ),
      students!inner ( student_code, first_name, last_name )
    `,
    )
    .eq("academic_year_id", params.academicYearId)
    .eq("semester_id", params.semesterId)
    .order("student_code", { ascending: true, foreignTable: "students" });

  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  } else if (!params.includeAllStatuses) {
    query = query.in("status", ["unpaid", "partial"]);
  }

  if (params.variant === "reimbursable") {
    query = query.eq("is_reimbursable", true);
  } else if (params.variant === "standard") {
    query = query.eq("is_reimbursable", false);
  }

  if (params.invoiceTypeId) {
    query = query.eq("invoice_type_id", params.invoiceTypeId);
  }

  if (allowedStudentIds) {
    query = query.in("student_id", allowedStudentIds);
  }

  const { data } = await query;

  type Row = {
    id: string;
    student_id: string;
    subtotal: number;
    total_amount: number;
    paid_amount: number;
    status: "unpaid" | "partial" | "paid";
    is_reimbursable: boolean;
    created_at: string;
    discount_type: "fixed" | "percent" | null;
    discount_value: number | null;
    invoice_types: { name: string } | null;
    students: { student_code: string; first_name: string; last_name: string };
  };

  const rows = (data ?? []) as unknown as Row[];
  const invoiceIds = rows.map((row) => row.id);
  const lastPaidByInvoice = await fetchLastPaidAtByInvoiceIds(supabase, invoiceIds);

  return rows.map((row) => {
    const totalAmount = Number(row.total_amount);
    const paidAmount = Number(row.paid_amount);
    const subtotal = Number(row.subtotal);
    return {
      invoiceId: row.id,
      studentId: row.student_id,
      studentCode: row.students.student_code,
      studentName: formatStudentName(row.students.first_name, row.students.last_name),
      gradeClassroom: gradeByStudent.get(row.student_id) ?? "—",
      subtotal,
      totalAmount,
      paidAmount,
      outstanding: Math.max(0, round2(totalAmount - paidAmount)),
      isReimbursable: row.is_reimbursable,
      status: row.status,
      invoiceTypeName: row.invoice_types?.name ?? "—",
      issuedAt: row.created_at,
      lastPaidAt: lastPaidByInvoice.get(row.id) ?? null,
      discountType: row.discount_type,
      discountValue: row.discount_value != null ? Number(row.discount_value) : null,
    };
  });
}

// A few thousand invoice UUIDs in a single .in() overflows the gateway's URL
// length limit and the request fails silently (see STUDENT_ID_BATCH_SIZE in
// lib/actions/invoices.ts for the same issue), so batch it.
const INVOICE_ID_BATCH_SIZE = 200;

async function fetchLastPaidAtByInvoiceIds(
  supabase: ReturnType<typeof createClient>,
  invoiceIds: string[],
): Promise<Map<string, string>> {
  if (invoiceIds.length === 0) return new Map();

  type AllocationRow = {
    invoice_id: string;
    payments: { paid_at: string; status: "active" | "voided" };
  };

  const batches: AllocationRow[][] = [];
  for (let i = 0; i < invoiceIds.length; i += INVOICE_ID_BATCH_SIZE) {
    const chunk = invoiceIds.slice(i, i + INVOICE_ID_BATCH_SIZE);
    const { data, error } = await supabase
      .from("payment_allocations")
      .select("invoice_id, payments!inner ( paid_at, status )")
      .in("invoice_id", chunk);
    if (error) throw error;
    batches.push((data ?? []) as unknown as AllocationRow[]);
  }

  const allocationRows = batches.flat();

  return latestPaidAtByInvoice(
    allocationRows.map((row) => ({
      invoiceId: row.invoice_id,
      paidAt: row.payments.paid_at,
      status: row.payments.status,
    })),
  );
}

export async function fetchCollectionsByGrade(
  semesterId: string,
  academicYearId: string,
  teacherProfileId?: string,
): Promise<CollectionsReportRow[]> {
  const supabase = createClient();

  const { data: grades } = await supabase
    .from("grade_levels")
    .select("id, name, sort_order")
    .eq("semester_id", semesterId)
    .order("sort_order", { ascending: true });

  if (!grades || grades.length === 0) return [];

  const results: CollectionsReportRow[] = [];

  for (const grade of grades) {
    const { data: classrooms } = await supabase
      .from("classrooms")
      .select("id")
      .eq("grade_level_id", grade.id)
      .eq("semester_id", semesterId);

    let classroomIds = (classrooms ?? []).map((c) => c.id);

    if (teacherProfileId) {
      const { data: assignments } = await supabase
        .from("teacher_assignments")
        .select("classroom_id")
        .eq("profile_id", teacherProfileId)
        .eq("semester_id", semesterId)
        .in("classroom_id", classroomIds);

      classroomIds = (assignments ?? []).map((a) => a.classroom_id);
    }

    if (classroomIds.length === 0) {
      results.push({
        gradeName: grade.name,
        studentCount: 0,
        totalDue: 0,
        totalPaid: 0,
        ratePercent: 0,
      });
      continue;
    }

    const { data: enrollments } = await supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("semester_id", semesterId)
      .eq("status", "enrolled")
      .in("classroom_id", classroomIds);

    const studentIds = (enrollments ?? []).map((e) => e.student_id);
    if (studentIds.length === 0) {
      results.push({
        gradeName: grade.name,
        studentCount: 0,
        totalDue: 0,
        totalPaid: 0,
        ratePercent: 0,
      });
      continue;
    }

    const { data: invoices } = await supabase
      .from("student_invoices")
      .select("total_amount, paid_amount")
      .eq("academic_year_id", academicYearId)
      .eq("semester_id", semesterId)
      .in("student_id", studentIds);

    const totalDue = (invoices ?? []).reduce((sum, i) => sum + Number(i.total_amount), 0);
    const totalPaid = (invoices ?? []).reduce((sum, i) => sum + Number(i.paid_amount), 0);
    const ratePercent = totalDue > 0 ? round2((totalPaid / totalDue) * 100) : 0;

    results.push({
      gradeName: grade.name,
      studentCount: studentIds.length,
      totalDue: round2(totalDue),
      totalPaid: round2(totalPaid),
      ratePercent,
    });
  }

  return results;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type StudentRosterRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: "unpaid" | "partial" | "paid";
};

export async function fetchStudentRoster(params: {
  semesterId: string;
  academicYearId: string;
  gradeLevelId?: string;
  classroomId?: string;
  status?: "unpaid" | "partial" | "paid" | "all";
  query?: string;
  teacherProfileId?: string;
}): Promise<StudentRosterRow[]> {
  const rows = await fetchOutstandingReport({
    semesterId: params.semesterId,
    academicYearId: params.academicYearId,
    gradeLevelId: params.gradeLevelId,
    classroomId: params.classroomId,
    status: params.status,
    variant: "all",
    includeAllStatuses: true,
    teacherProfileId: params.teacherProfileId,
  });

  const q = params.query?.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.studentName.toLowerCase().includes(q) ||
          r.studentCode.toLowerCase().includes(q),
      )
    : rows;

  return filtered.map((r) => ({
    studentId: r.studentId,
    studentCode: r.studentCode,
    studentName: r.studentName,
    gradeClassroom: r.gradeClassroom,
    totalAmount: r.totalAmount,
    paidAmount: r.paidAmount,
    outstanding: r.outstanding,
    status: r.status,
  }));
}

export type CollectionsSummary = {
  studentCount: number;
  totalDue: number;
  totalPaid: number;
  outstanding: number;
  ratePercent: number;
};

export async function fetchCollectionsSummary(
  semesterId: string,
  academicYearId: string,
  teacherProfileId?: string,
): Promise<CollectionsSummary> {
  const rows = await fetchCollectionsByClassroom(semesterId, academicYearId, teacherProfileId);
  const totalDue = rows.reduce((s, r) => s + r.totalDue, 0);
  const totalPaid = rows.reduce((s, r) => s + r.totalPaid, 0);
  const studentCount = rows.reduce((s, r) => s + r.studentCount, 0);
  return {
    studentCount,
    totalDue: round2(totalDue),
    totalPaid: round2(totalPaid),
    outstanding: round2(totalDue - totalPaid),
    ratePercent: totalDue > 0 ? round2((totalPaid / totalDue) * 100) : 0,
  };
}

export type ClassroomCollectionsRow = {
  classroomLabel: string;
  studentCount: number;
  totalDue: number;
  totalPaid: number;
  ratePercent: number;
};

export async function fetchCollectionsByClassroom(
  semesterId: string,
  academicYearId: string,
  teacherProfileId?: string,
): Promise<ClassroomCollectionsRow[]> {
  const supabase = createClient();

  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("id, name, grade_levels ( name, sort_order )")
    .eq("semester_id", semesterId);

  type ClassroomRow = {
    id: string;
    name: string;
    grade_levels: { name: string; sort_order: number } | null;
  };
  let list = (classrooms ?? []) as unknown as ClassroomRow[];

  if (teacherProfileId) {
    const { data: assignments } = await supabase
      .from("teacher_assignments")
      .select("classroom_id")
      .eq("profile_id", teacherProfileId)
      .eq("semester_id", semesterId);
    const allowed = new Set((assignments ?? []).map((a) => a.classroom_id));
    list = list.filter((c) => allowed.has(c.id));
  }

  list.sort((a, b) => {
    const so = (a.grade_levels?.sort_order ?? 0) - (b.grade_levels?.sort_order ?? 0);
    return so !== 0 ? so : a.name.localeCompare(b.name, "th");
  });

  const results: ClassroomCollectionsRow[] = [];

  for (const classroom of list) {
    const label = `${classroom.grade_levels?.name ?? ""}/${classroom.name}`;

    const { data: enrollments } = await supabase
      .from("student_enrollments")
      .select("student_id")
      .eq("semester_id", semesterId)
      .eq("status", "enrolled")
      .eq("classroom_id", classroom.id);

    const studentIds = (enrollments ?? []).map((e) => e.student_id);
    if (studentIds.length === 0) {
      results.push({ classroomLabel: label, studentCount: 0, totalDue: 0, totalPaid: 0, ratePercent: 0 });
      continue;
    }

    const { data: invoices } = await supabase
      .from("student_invoices")
      .select("total_amount, paid_amount")
      .eq("academic_year_id", academicYearId)
      .eq("semester_id", semesterId)
      .in("student_id", studentIds);

    const totalDue = (invoices ?? []).reduce((s, i) => s + Number(i.total_amount), 0);
    const totalPaid = (invoices ?? []).reduce((s, i) => s + Number(i.paid_amount), 0);
    results.push({
      classroomLabel: label,
      studentCount: studentIds.length,
      totalDue: round2(totalDue),
      totalPaid: round2(totalPaid),
      ratePercent: totalDue > 0 ? round2((totalPaid / totalDue) * 100) : 0,
    });
  }

  return results;
}

export type DailyDetailReceipt = {
  paymentId: string;
  receiptNumber: string;
  paidAt: string;
  timeLabel: string;
  studentName: string;
  studentCode: string;
  gradeClassroom: string;
  paymentMethod: "cash" | "transfer";
  amount: number;
  status: "active" | "voided";
  recordedByName: string;
};

export type DailyRevenueResult = {
  summary: DailyRevenueRow[];
  receiptsByDate: Record<string, DailyDetailReceipt[]>;
};

export async function fetchDailyRevenue(params: {
  academicYearId: string;
  semesterId: string;
  dateFrom: string; // YYYY-MM-DD (Bangkok day)
  dateTo: string; // YYYY-MM-DD (Bangkok day)
  method?: "all" | "cash" | "transfer";
}): Promise<DailyRevenueResult> {
  const supabase = createClient();

  const fromIso = `${params.dateFrom}T00:00:00+07:00`;
  const toIso = `${params.dateTo}T23:59:59.999+07:00`;

  let query = supabase
    .from("payments")
    .select(
      `
      id,
      receipt_number,
      amount,
      payment_method,
      paid_at,
      status,
      student_id,
      students!inner ( student_code, first_name, last_name ),
      profiles!payments_recorded_by_fkey ( display_name )
    `,
    )
    .eq("academic_year_id", params.academicYearId)
    .gte("paid_at", fromIso)
    .lte("paid_at", toIso)
    .order("paid_at", { ascending: false });

  if (params.method && params.method !== "all") {
    query = query.eq("payment_method", params.method);
  }

  type Row = {
    id: string;
    receipt_number: string;
    amount: number;
    payment_method: "cash" | "transfer";
    paid_at: string;
    status: "active" | "voided";
    student_id: string;
    students: { student_code: string; first_name: string; last_name: string };
    profiles: { display_name: string } | null;
  };

  const [{ data }, gradeByStudent] = await Promise.all([
    query,
    getStudentGradeMap(params.semesterId),
  ]);
  const rows = (data ?? []) as unknown as Row[];

  const summary = groupDailyRevenue(
    rows.map((r) => ({
      amount: Number(r.amount),
      paymentMethod: r.payment_method,
      paidAt: r.paid_at,
      status: r.status,
    })),
  );

  const receiptsByDate: Record<string, DailyDetailReceipt[]> = {};
  for (const r of rows) {
    const key = bangkokDateKey(r.paid_at);
    (receiptsByDate[key] ??= []).push({
      paymentId: r.id,
      receiptNumber: r.receipt_number,
      paidAt: r.paid_at,
      timeLabel: formatThaiTime(r.paid_at),
      studentName: formatStudentName(r.students.first_name, r.students.last_name),
      studentCode: r.students.student_code,
      gradeClassroom: gradeByStudent.get(r.student_id) ?? "—",
      paymentMethod: r.payment_method,
      amount: Number(r.amount),
      status: r.status,
      recordedByName: r.profiles?.display_name ?? "—",
    });
  }

  return { summary, receiptsByDate };
}

export function flattenReceiptsForIssuanceReport(
  receiptsByDate: Record<string, DailyDetailReceipt[]>,
): DailyDetailReceipt[] {
  return Object.values(receiptsByDate)
    .flat()
    .sort((a, b) => (a.paidAt < b.paidAt ? -1 : a.paidAt > b.paidAt ? 1 : 0));
}

export type StatementLine = {
  description: string;
  amount: number;
  yearLabel?: string;
};
export type StatementPayment = {
  paidAt: string;
  dateLabel: string;
  receiptNumber: string;
  method: "cash" | "transfer";
  amount: number;
  status: "active" | "voided";
  yearLabel?: string;
};
export type StudentStatement = {
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  lines: StatementLine[];
  payments: StatementPayment[];
  totalDue: number;
  totalPaid: number;
  outstanding: number;
};

export async function fetchStudentStatement(
  studentId: string,
  semesterId: string,
  academicYearId: string,
): Promise<StudentStatement | null> {
  const supabase = createClient();
  const gradeByStudent = await getStudentGradeMap(semesterId);

  const { data: student } = await supabase
    .from("students")
    .select("student_code, first_name, last_name")
    .eq("id", studentId)
    .single();
  if (!student) return null;

  const { data: invoices } = await supabase
    .from("student_invoices")
    .select("id, total_amount, paid_amount, invoice_lines ( description, amount )")
    .eq("student_id", studentId)
    .eq("academic_year_id", academicYearId)
    .eq("semester_id", semesterId);

  type InvoiceRow = {
    id: string;
    total_amount: number;
    paid_amount: number;
    invoice_lines: { description: string; amount: number }[];
  };
  const invoiceRows = (invoices ?? []) as unknown as InvoiceRow[];

  const lines: StatementLine[] = invoiceRows.flatMap((inv) =>
    (inv.invoice_lines ?? []).map((l) => ({ description: l.description, amount: Number(l.amount) })),
  );
  const totalDue = invoiceRows.reduce((s, i) => s + Number(i.total_amount), 0);
  const totalPaid = invoiceRows.reduce((s, i) => s + Number(i.paid_amount), 0);

  const { data: payments } = await supabase
    .from("payments")
    .select("receipt_number, payment_method, amount, paid_at, status")
    .eq("student_id", studentId)
    .eq("academic_year_id", academicYearId)
    .order("paid_at", { ascending: true });

  type PayRow = {
    receipt_number: string;
    payment_method: "cash" | "transfer";
    amount: number;
    paid_at: string;
    status: "active" | "voided";
  };
  const paymentRows = ((payments ?? []) as unknown as PayRow[]).map((p) => ({
    paidAt: p.paid_at,
    dateLabel: formatThaiDate(p.paid_at),
    receiptNumber: p.receipt_number,
    method: p.payment_method,
    amount: Number(p.amount),
    status: p.status,
  }));

  return {
    studentCode: student.student_code,
    studentName: formatStudentName(student.first_name, student.last_name),
    gradeClassroom: gradeByStudent.get(studentId) ?? "—",
    lines,
    payments: paymentRows,
    totalDue: round2(totalDue),
    totalPaid: round2(totalPaid),
    outstanding: Math.max(0, round2(totalDue - totalPaid)),
  };
}

export type DiscountReportItemRow = {
  feeItemId: string;
  feeItemName: string;
  count: number;
  totalDiscount: number;
};
export type DiscountReportResult = { rows: DiscountReportItemRow[]; grandTotal: number };

export async function fetchDiscountReport(params: {
  academicYearId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<DiscountReportResult> {
  const supabase = createClient();
  const { data } = await supabase
    .from("payment_discounts")
    .select("amount, fee_item_id, fee_items ( name ), payments!inner ( status, academic_year_id, paid_at )")
    .eq("payments.status", "active")
    .eq("payments.academic_year_id", params.academicYearId)
    .gte("payments.paid_at", `${params.dateFrom}T00:00:00+07:00`)
    .lte("payments.paid_at", `${params.dateTo}T23:59:59+07:00`);

  type Row = { amount: string; fee_item_id: string; fee_items: { name: string } | null };
  const byItem = new Map<string, DiscountReportItemRow>();
  let grandTotal = 0;
  for (const r of (data ?? []) as unknown as Row[]) {
    const amount = Number(r.amount);
    grandTotal += amount;
    const e = byItem.get(r.fee_item_id);
    if (e) {
      e.count += 1;
      e.totalDiscount = Math.round((e.totalDiscount + amount) * 100) / 100;
    } else {
      byItem.set(r.fee_item_id, { feeItemId: r.fee_item_id, feeItemName: r.fee_items?.name ?? "—", count: 1, totalDiscount: amount });
    }
  }
  return { rows: [...byItem.values()].sort((a, b) => b.totalDiscount - a.totalDiscount), grandTotal: Math.round(grandTotal * 100) / 100 };
}

export type DailyRemittanceItem = {
  receiptTypeId: string;
  code: string;
  name: string;
  amount: number;
};

export async function fetchDailyRemittanceItems(params: {
  academicYearId: string;
  dateFrom: string;
  dateTo: string;
  method?: "all" | "cash" | "transfer";
}): Promise<DailyRemittanceItem[]> {
  const supabase = createClient();

  let query = supabase
    .from("payment_allocations")
    .select(
      `
      amount,
      payments!inner ( status, academic_year_id, paid_at, payment_method ),
      student_invoices!inner ( invoice_type_id, invoice_types ( code, name ) )
    `,
    )
    .eq("payments.status", "active")
    .eq("payments.academic_year_id", params.academicYearId)
    .gte("payments.paid_at", `${params.dateFrom}T00:00:00+07:00`)
    .lte("payments.paid_at", `${params.dateTo}T23:59:59.999+07:00`);

  if (params.method && params.method !== "all") {
    query = query.eq("payments.payment_method", params.method);
  }

  type Row = {
    amount: string;
    student_invoices: {
      invoice_type_id: string;
      invoice_types: { code: string; name: string } | null;
    };
  };

  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  const byType = new Map<string, DailyRemittanceItem>();
  for (const r of rows) {
    const amount = Number(r.amount);
    const receiptTypeId = r.student_invoices.invoice_type_id;
    const existing = byType.get(receiptTypeId);
    if (existing) {
      existing.amount = Math.round((existing.amount + amount) * 100) / 100;
    } else {
      byType.set(receiptTypeId, {
        receiptTypeId,
        code: r.student_invoices.invoice_types?.code ?? "—",
        name: r.student_invoices.invoice_types?.name ?? "—",
        amount,
      });
    }
  }

  return [...byType.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export async function fetchStudentStatementAllYears(
  studentId: string,
): Promise<StudentStatement | null> {
  const supabase = createClient();

  const { data: student } = await supabase
    .from("students")
    .select("student_code, first_name, last_name")
    .eq("id", studentId)
    .single();
  if (!student) return null;

  const { data: invoices } = await supabase
    .from("student_invoices")
    .select(
      `id, total_amount, paid_amount,
       invoice_lines ( description, amount ),
       semesters ( number, academic_years ( name ) )`,
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });

  type InvoiceRowAll = {
    id: string;
    total_amount: number;
    paid_amount: number;
    invoice_lines: { description: string; amount: number }[];
    semesters: { number: number; academic_years: { name: string } | null } | null;
  };
  const invoiceRows = (invoices ?? []) as unknown as InvoiceRowAll[];

  const lines: StatementLine[] = invoiceRows.flatMap((inv) => {
    const sem = inv.semesters;
    const yearLabel = sem
      ? `${sem.academic_years?.name ?? "?"} ภาค ${sem.number}`
      : undefined;
    return (inv.invoice_lines ?? []).map((l) => ({
      description: l.description,
      amount: Number(l.amount),
      yearLabel,
    }));
  });

  const totalDue = invoiceRows.reduce((s, i) => s + Number(i.total_amount), 0);
  const totalPaid = invoiceRows.reduce((s, i) => s + Number(i.paid_amount), 0);

  const { data: payments } = await supabase
    .from("payments")
    .select(
      `receipt_number, payment_method, amount, paid_at, status,
       semesters ( number, academic_years ( name ) )`,
    )
    .eq("student_id", studentId)
    .order("paid_at", { ascending: true });

  type PayRowAll = {
    receipt_number: string;
    payment_method: "cash" | "transfer";
    amount: number;
    paid_at: string;
    status: "active" | "voided";
    semesters: { number: number; academic_years: { name: string } | null } | null;
  };
  const paymentRows = ((payments ?? []) as unknown as PayRowAll[]).map((p) => {
    const sem = p.semesters;
    return {
      paidAt: p.paid_at,
      dateLabel: formatThaiDate(p.paid_at),
      receiptNumber: p.receipt_number,
      method: p.payment_method,
      amount: Number(p.amount),
      status: p.status,
      yearLabel: sem
        ? `${sem.academic_years?.name ?? "?"} ภาค ${sem.number}`
        : undefined,
    };
  });

  const { data: enrollment } = await supabase
    .from("student_enrollments")
    .select(`classrooms ( name, grade_levels ( name ) )`)
    .eq("student_id", studentId)
    .eq("status", "enrolled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  type EnrollRow = {
    classrooms: { name: string; grade_levels: { name: string } | null } | null;
  };
  const enroll = enrollment as unknown as EnrollRow | null;
  const gradeClassroom = enroll?.classrooms
    ? formatClassroom(
        enroll.classrooms.grade_levels?.name ?? null,
        enroll.classrooms.name,
      )
    : "—";

  return {
    studentCode: student.student_code,
    studentName: formatStudentName(student.first_name, student.last_name),
    gradeClassroom,
    lines,
    payments: paymentRows,
    totalDue: round2(totalDue),
    totalPaid: round2(totalPaid),
    outstanding: Math.max(0, round2(totalDue - totalPaid)),
  };
}

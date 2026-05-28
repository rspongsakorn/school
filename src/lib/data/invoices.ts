import { formatClassroom, formatStudentName } from "@/lib/format";
import { getStudentGradeMap } from "@/lib/data/enrollments";
import type { InvoiceDeleteContext } from "@/lib/finance/invoice-delete-eligibility";
import { buildStudentSearchOrFilter } from "@/lib/students/search";
import { createClient } from "@/lib/supabase/server";

export type InvoiceStatus = "unpaid" | "partial" | "paid";

export type InvoiceListRow = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  invoiceName: string;
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: InvoiceStatus;
  discountType: "percent" | "fixed" | null;
  discountValue: number | null;
  isReimbursable: boolean;
  createdAt: string;
  hasActivePaymentAllocation: boolean;
};

export type PaginatedInvoices = {
  rows: InvoiceListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const INVOICE_PAGE_SIZE = 50;

export type OutstandingInvoiceRow = {
  id: string;
  invoiceName: string;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  createdAt: string;
};

export async function listInvoicesPaginated(params: {
  semesterId: string;
  academicYearId: string;
  q?: string;
  gradeLevelId?: string;
  classroomId?: string;
  status?: InvoiceStatus | "all";
  page?: number;
}): Promise<PaginatedInvoices> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = INVOICE_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();
  const gradeByStudent = await getStudentGradeMap(params.semesterId);

  let studentIdsFilter: string[] | null = null;

  if (params.gradeLevelId || params.classroomId) {
    let enrollmentQuery = supabase
      .from("student_enrollments")
      .select("student_id, classroom_id, classrooms!inner(grade_level_id)")
      .eq("semester_id", params.semesterId)
      .eq("status", "enrolled");

    if (params.classroomId) {
      enrollmentQuery = enrollmentQuery.eq("classroom_id", params.classroomId);
    } else if (params.gradeLevelId) {
      enrollmentQuery = enrollmentQuery.eq("classrooms.grade_level_id", params.gradeLevelId);
    }

    const { data: enrollments } = await enrollmentQuery;
    studentIdsFilter = (enrollments ?? []).map((e) => e.student_id);
    if (studentIdsFilter.length === 0) {
      return { rows: [], total: 0, page, pageSize, totalPages: 0 };
    }
  }

  let query = supabase
    .from("student_invoices")
    .select(
      `
      id,
      student_id,
      invoice_name,
      subtotal,
      total_amount,
      paid_amount,
      status,
      discount_type,
      discount_value,
      is_reimbursable,
      created_at,
      students!inner ( student_code, first_name, last_name )
    `,
      { count: "exact" },
    )
    .eq("academic_year_id", params.academicYearId)
    .eq("semester_id", params.semesterId)
    .order("created_at", { ascending: false });

  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (studentIdsFilter) {
    query = query.in("student_id", studentIdsFilter);
  }

  const q = params.q?.trim();
  if (q) {
    const searchFilter = buildStudentSearchOrFilter(q);
    if (searchFilter) {
      query = query.or(searchFilter, { foreignTable: "students" });
    }
  }

  const { data, count, error } = await query.range(from, to);

  if (error || !data) {
    return { rows: [], total: 0, page, pageSize, totalPages: 0 };
  }

  type Row = {
    id: string;
    student_id: string;
    invoice_name: string;
    subtotal: number;
    total_amount: number;
    paid_amount: number;
    status: InvoiceStatus;
    discount_type: "percent" | "fixed" | null;
    discount_value: number | null;
    is_reimbursable: boolean;
    created_at: string;
    students: { student_code: string; first_name: string; last_name: string };
  };

  const invoiceIds = (data as unknown as Row[]).map((row) => row.id);
  const activeAllocationInvoiceIds = await loadActiveAllocationInvoiceIds(invoiceIds);

  const rows: InvoiceListRow[] = (data as unknown as Row[]).map((row) => {
    const totalAmount = Number(row.total_amount);
    const paidAmount = Number(row.paid_amount);
    return {
      id: row.id,
      studentId: row.student_id,
      studentCode: row.students.student_code,
      studentName: formatStudentName(row.students.first_name, row.students.last_name),
      gradeClassroom: gradeByStudent.get(row.student_id) ?? "—",
      invoiceName: row.invoice_name,
      subtotal: Number(row.subtotal),
      totalAmount,
      paidAmount,
      outstanding: Math.max(0, round2(totalAmount - paidAmount)),
      status: row.status,
      discountType: row.discount_type,
      discountValue: row.discount_value != null ? Number(row.discount_value) : null,
      isReimbursable: row.is_reimbursable,
      createdAt: row.created_at,
      hasActivePaymentAllocation: activeAllocationInvoiceIds.has(row.id),
    };
  });

  const total = count ?? 0;
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getStudentOutstandingInvoices(
  studentId: string,
  semesterId: string,
): Promise<OutstandingInvoiceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_invoices")
    .select("id, invoice_name, total_amount, paid_amount, created_at, status")
    .eq("student_id", studentId)
    .eq("semester_id", semesterId)
    .in("status", ["unpaid", "partial"])
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => {
    const totalAmount = Number(row.total_amount);
    const paidAmount = Number(row.paid_amount);
    return {
      id: row.id,
      invoiceName: row.invoice_name,
      totalAmount,
      paidAmount,
      outstanding: Math.max(0, round2(totalAmount - paidAmount)),
      createdAt: row.created_at,
    };
  });
}

export type InvoiceCandidateRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  hasInvoice: boolean;
};

export async function listInvoiceCandidates(semesterId: string): Promise<InvoiceCandidateRow[]> {
  const supabase = await createClient();
  const [gradeByStudent, existingSet] = await Promise.all([
    getStudentGradeMap(semesterId),
    listStudentIdsWithInvoice(semesterId),
  ]);

  const { data } = await supabase
    .from("student_enrollments")
    .select(
      `
      student_id,
      students!inner ( student_code, first_name, last_name )
    `,
    )
    .eq("semester_id", semesterId)
    .eq("status", "enrolled")
    .order("student_code", { ascending: true, foreignTable: "students" });

  type Row = {
    student_id: string;
    students: { student_code: string; first_name: string; last_name: string };
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    studentId: row.student_id,
    studentCode: row.students.student_code,
    studentName: formatStudentName(row.students.first_name, row.students.last_name),
    gradeClassroom: gradeByStudent.get(row.student_id) ?? "—",
    hasInvoice: existingSet.has(row.student_id),
  }));
}

export async function getInvoiceDeleteContext(
  invoiceIds: string[],
): Promise<Map<string, InvoiceDeleteContext>> {
  if (invoiceIds.length === 0) return new Map();

  const supabase = await createClient();
  const [invoicesResult, activeAllocationIds] = await Promise.all([
    supabase
      .from("student_invoices")
      .select("id, paid_amount, total_amount")
      .in("id", invoiceIds),
    loadActiveAllocationInvoiceIds(invoiceIds),
  ]);

  const map = new Map<string, InvoiceDeleteContext>();
  for (const row of invoicesResult.data ?? []) {
    map.set(row.id, {
      paidAmount: Number(row.paid_amount),
      totalAmount: Number(row.total_amount),
      hasActivePaymentAllocation: activeAllocationIds.has(row.id),
    });
  }
  return map;
}

async function loadActiveAllocationInvoiceIds(invoiceIds: string[]): Promise<Set<string>> {
  if (invoiceIds.length === 0) return new Set();

  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_allocations")
    .select("invoice_id, payments!inner ( status )")
    .in("invoice_id", invoiceIds)
    .eq("payments.status", "active");

  type Row = { invoice_id: string; payments: { status: string } };
  return new Set(((data ?? []) as unknown as Row[]).map((row) => row.invoice_id));
}

export async function listStudentIdsWithInvoice(semesterId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_invoices")
    .select("student_id")
    .eq("semester_id", semesterId);

  return new Set((data ?? []).map((r) => r.student_id));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

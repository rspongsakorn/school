import { formatClassroom, formatStudentName } from "@/lib/format";
import { buildStudentSearchOrFilter } from "@/lib/students/search";
import { createClient } from "@/lib/supabase/client";

export type InvoiceStatus = "unpaid" | "partial" | "paid";

export type InvoiceListRow = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  gradeLevelId: string | null;
  classroomId: string | null;
  invoiceName: string;
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  status: InvoiceStatus;
  discountType: "percent" | "fixed" | null;
  discountValue: number | null;
  isReimbursable: boolean;
  invoiceTypeId: string;
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

export type InvoiceCandidateRow = {
  studentId: string;
  studentCode: string;
  studentName: string;
  gradeClassroom: string;
  gradeSortOrder: number;
  /** Invoice type ids the student already has an invoice for this semester. */
  invoiceTypeIds: string[];
};

const INVOICE_PAGE_SIZE = 50;

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

async function getStudentGradeSortMap(semesterId: string): Promise<Map<string, number>> {
  const supabase = createClient();

  type GradeSortRow = {
    student_id: string;
    classrooms: { grade_levels: { sort_order: number } | null } | null;
  };

  const { data } = await supabase
    .from("student_enrollments")
    .select("student_id, classrooms ( grade_levels ( sort_order ) )")
    .eq("semester_id", semesterId)
    .eq("status", "enrolled");

  const map = new Map<string, number>();
  for (const row of (data ?? []) as unknown as GradeSortRow[]) {
    map.set(row.student_id, row.classrooms?.grade_levels?.sort_order ?? 0);
  }
  return map;
}

type EnrollmentInfo = {
  gradeClassroom: string;
  classroomId: string | null;
  gradeLevelId: string | null;
};

async function getStudentEnrollmentMap(semesterId: string): Promise<Map<string, EnrollmentInfo>> {
  const supabase = createClient();

  type EnrollRow = {
    student_id: string;
    classroom_id: string | null;
    classrooms: { name: string; grade_level_id: string; grade_levels: { name: string } | null } | null;
  };

  const { data } = await supabase
    .from("student_enrollments")
    .select("student_id, classroom_id, classrooms ( name, grade_level_id, grade_levels ( name ) )")
    .eq("semester_id", semesterId)
    .eq("status", "enrolled");

  const map = new Map<string, EnrollmentInfo>();
  for (const row of (data ?? []) as unknown as EnrollRow[]) {
    const classroom = row.classrooms;
    const gradeName = classroom?.grade_levels?.name ?? null;
    map.set(row.student_id, {
      gradeClassroom: formatClassroom(gradeName, classroom?.name ?? null),
      classroomId: row.classroom_id,
      gradeLevelId: classroom?.grade_level_id ?? null,
    });
  }
  return map;
}

export async function fetchAllInvoices(params: {
  semesterId: string;
  academicYearId: string;
}): Promise<InvoiceListRow[]> {
  const supabase = createClient();
  const enrollmentMap = await getStudentEnrollmentMap(params.semesterId);

  const { data, error } = await supabase
    .from("student_invoices")
    .select(
      `
      id,
      student_id,
      subtotal,
      total_amount,
      paid_amount,
      status,
      discount_type,
      discount_value,
      is_reimbursable,
      invoice_type_id,
      invoice_types ( name ),
      created_at,
      students!inner ( student_code, first_name, last_name )
    `,
    )
    .eq("academic_year_id", params.academicYearId)
    .eq("semester_id", params.semesterId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  type Row = {
    id: string;
    student_id: string;
    invoice_types: { name: string } | null;
    subtotal: number;
    total_amount: number;
    paid_amount: number;
    status: InvoiceStatus;
    discount_type: "percent" | "fixed" | null;
    discount_value: number | null;
    is_reimbursable: boolean;
    invoice_type_id: string;
    created_at: string;
    students: { student_code: string; first_name: string; last_name: string };
  };

  const invoiceIds = (data as unknown as Row[]).map((r) => r.id);
  const activeAllocationIds = await loadActiveAllocationInvoiceIds(invoiceIds);

  return (data as unknown as Row[]).map((row) => {
    const totalAmount = Number(row.total_amount);
    const paidAmount = Number(row.paid_amount);
    const enroll = enrollmentMap.get(row.student_id);
    return {
      id: row.id,
      studentId: row.student_id,
      studentCode: row.students.student_code,
      studentName: formatStudentName(row.students.first_name, row.students.last_name),
      gradeClassroom: enroll?.gradeClassroom ?? "—",
      gradeLevelId: enroll?.gradeLevelId ?? null,
      classroomId: enroll?.classroomId ?? null,
      invoiceName: row.invoice_types?.name ?? "—",
      subtotal: Number(row.subtotal),
      totalAmount,
      paidAmount,
      outstanding: Math.max(0, round2(totalAmount - paidAmount)),
      status: row.status,
      discountType: row.discount_type,
      discountValue: row.discount_value != null ? Number(row.discount_value) : null,
      isReimbursable: row.is_reimbursable,
      invoiceTypeId: row.invoice_type_id,
      createdAt: row.created_at,
      hasActivePaymentAllocation: activeAllocationIds.has(row.id),
    };
  });
}

async function loadActiveAllocationInvoiceIds(invoiceIds: string[]): Promise<Set<string>> {
  if (invoiceIds.length === 0) return new Set();

  const supabase = createClient();
  const { data } = await supabase
    .from("payment_allocations")
    .select("invoice_id, payments!inner ( status )")
    .in("invoice_id", invoiceIds)
    .eq("payments.status", "active");

  type Row = { invoice_id: string; payments: { status: string } };
  return new Set(((data ?? []) as unknown as Row[]).map((row) => row.invoice_id));
}

/** Map of studentId → set of invoice_type_ids the student already has this semester. */
async function listStudentInvoiceTypeMap(
  semesterId: string,
): Promise<Map<string, Set<string>>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("student_invoices")
    .select("student_id, invoice_type_id")
    .eq("semester_id", semesterId);

  const map = new Map<string, Set<string>>();
  for (const r of (data ?? []) as { student_id: string; invoice_type_id: string }[]) {
    let set = map.get(r.student_id);
    if (!set) {
      set = new Set();
      map.set(r.student_id, set);
    }
    set.add(r.invoice_type_id);
  }
  return map;
}

export async function fetchInvoicesPaginated(params: {
  semesterId: string;
  academicYearId: string;
  q?: string;
  gradeLevelId?: string;
  classroomId?: string;
  status?: InvoiceStatus | "all";
  reimbursable?: "reimbursable" | "standard" | "all";
  page?: number;
}): Promise<PaginatedInvoices> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = INVOICE_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = createClient();
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
      subtotal,
      total_amount,
      paid_amount,
      status,
      discount_type,
      discount_value,
      is_reimbursable,
      invoice_type_id,
      invoice_types ( name ),
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

  if (params.reimbursable && params.reimbursable !== "all") {
    query = query.eq("is_reimbursable", params.reimbursable === "reimbursable");
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
    invoice_types: { name: string } | null;
    subtotal: number;
    total_amount: number;
    paid_amount: number;
    status: InvoiceStatus;
    discount_type: "percent" | "fixed" | null;
    discount_value: number | null;
    is_reimbursable: boolean;
    invoice_type_id: string;
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
      gradeLevelId: null,
      classroomId: null,
      invoiceName: row.invoice_types?.name ?? "—",
      subtotal: Number(row.subtotal),
      totalAmount,
      paidAmount,
      outstanding: Math.max(0, round2(totalAmount - paidAmount)),
      status: row.status,
      discountType: row.discount_type,
      discountValue: row.discount_value != null ? Number(row.discount_value) : null,
      isReimbursable: row.is_reimbursable,
      invoiceTypeId: row.invoice_type_id,
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

export async function fetchInvoiceCandidates(semesterId: string): Promise<InvoiceCandidateRow[]> {
  const supabase = createClient();
  const [gradeByStudent, gradeSortByStudent, typesByStudent] = await Promise.all([
    getStudentGradeMap(semesterId),
    getStudentGradeSortMap(semesterId),
    listStudentInvoiceTypeMap(semesterId),
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

  return ((data ?? []) as unknown as Row[])
    .map((row) => ({
      studentId: row.student_id,
      studentCode: row.students.student_code,
      studentName: formatStudentName(row.students.first_name, row.students.last_name),
      gradeClassroom: gradeByStudent.get(row.student_id) ?? "—",
      gradeSortOrder: gradeSortByStudent.get(row.student_id) ?? 0,
      invoiceTypeIds: [...(typesByStudent.get(row.student_id) ?? [])],
    }))
    .sort((a, b) => a.studentCode.localeCompare(b.studentCode, undefined, { numeric: true }));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

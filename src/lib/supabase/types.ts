export type ProfileRole = "admin" | "finance" | "teacher";

type TableDef<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<{
        id: string;
        role: ProfileRole;
        display_name: string;
        is_active: boolean;
      }>;
      academic_years: TableDef<{
        id: string;
        name: string;
        is_active: boolean;
        start_date: string;
        end_date: string;
      }>;
      semesters: TableDef<{
        id: string;
        academic_year_id: string;
        number: number;
        name: string | null;
        start_date: string;
        end_date: string;
      }>;
      students: TableDef<{
        id: string;
        student_code: string;
        first_name: string;
        last_name: string;
        id_card: string | null;
        gender: "male" | "female" | null;
        date_of_birth: string | null;
        status: "active" | "graduated" | "transferred" | "withdrawn";
      }>;
      grade_levels: TableDef<{
        id: string;
        name: string;
        academic_year_id: string;
        semester_id: string;
        sort_order: number;
      }>;
      classrooms: TableDef<{
        id: string;
        name: string;
        grade_level_id: string;
        academic_year_id: string;
        semester_id: string;
      }>;
      student_enrollments: TableDef<{
        id: string;
        student_id: string;
        classroom_id: string;
        academic_year_id: string;
        semester_id: string;
        status: "enrolled" | "transferred" | "withdrawn";
      }>;
      teacher_assignments: TableDef<{
        id: string;
        profile_id: string;
        classroom_id: string;
        academic_year_id: string;
        semester_id: string;
        role: string;
      }>;
      fee_items: TableDef<{
        id: string;
        name: string;
        description: string | null;
        is_tuition: boolean;
        is_active: boolean;
        sort_order: number;
        has_reimbursable_variant: boolean;
        receipt_type_id: string;
      }>;
      receipt_types: TableDef<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        is_active: boolean;
      }>;
      fee_rates: TableDef<{
        id: string;
        academic_year_id: string;
        semester_id: string;
        grade_level_id: string;
        fee_item_id: string;
        amount: number;
        receipt_type_id: string | null;
        amount_reimbursable: number | null;
      }>;
      student_invoices: TableDef<{
        id: string;
        student_id: string;
        academic_year_id: string;
        semester_id: string;
        invoice_name: string;
        subtotal: number;
        discount_type: "percent" | "fixed" | null;
        discount_value: number | null;
        total_amount: number;
        paid_amount: number;
        status: "unpaid" | "partial" | "paid";
        created_at: string;
        is_reimbursable: boolean;
        receipt_type_id: string;
      }>;
      invoice_lines: TableDef<{
        id: string;
        invoice_id: string;
        fee_item_id: string;
        description: string;
        amount: number;
        variant: "standard" | "reimbursable";
      }>;
      payments: TableDef<{
        id: string;
        receipt_number: string;
        student_id: string;
        academic_year_id: string;
        amount: number;
        payment_method: "cash" | "transfer";
        transfer_reference: string | null;
        paid_at: string;
        recorded_by: string;
        note: string | null;
        status: "active" | "voided";
      }>;
      payment_allocations: TableDef<{
        id: string;
        payment_id: string;
        invoice_id: string;
        amount: number;
      }>;
      receipts: TableDef<{
        id: string;
        payment_id: string;
        receipt_number: string;
        receipt_type_id: string;
        snapshot_data: Record<string, unknown>;
        issued_at: string;
      }>;
      payment_voids: TableDef<{
        id: string;
        payment_id: string;
        voided_by: string;
        voided_at: string;
        reason: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      create_academic_year_with_semesters: {
        Args: {
          p_name: string;
          p_start_date: string;
          p_end_date: string;
          p_is_active: boolean;
          p_sem1_start: string;
          p_sem1_end: string;
          p_sem1_name: string;
        };
        Returns: string;
      };
      update_academic_year_with_semesters: {
        Args: {
          p_year_id: string;
          p_name: string;
          p_start_date: string;
          p_end_date: string;
          p_is_active: boolean;
          p_sem1_start: string;
          p_sem1_end: string;
          p_sem1_name: string;
          p_sem2_start: string;
          p_sem2_end: string;
          p_sem2_name: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

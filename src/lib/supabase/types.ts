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
        status: "active" | "graduated" | "transferred" | "withdrawn";
      }>;
      grade_levels: TableDef<{
        id: string;
        name: string;
        academic_year_id: string;
        sort_order: number;
      }>;
      classrooms: TableDef<{
        id: string;
        name: string;
        grade_level_id: string;
        academic_year_id: string;
      }>;
      student_enrollments: TableDef<{
        id: string;
        student_id: string;
        classroom_id: string;
        academic_year_id: string;
        status: string;
      }>;
      student_invoices: TableDef<{
        id: string;
        student_id: string;
        academic_year_id: string;
        semester_id: string;
        total_amount: number;
        paid_amount: number;
        status: string;
        created_at: string;
      }>;
      payments: TableDef<{
        id: string;
        receipt_number: string;
        student_id: string;
        academic_year_id: string;
        amount: number;
        paid_at: string;
        status: string;
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
          p_sem2_start: string;
          p_sem2_end: string;
          p_sem2_name: string;
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

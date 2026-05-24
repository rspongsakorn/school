-- Tuition management schema (design spec §3–§5)
-- https://github.com — docs/superpowers/specs/2026-05-24-tuition-management-design.md

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.student_status AS ENUM (
  'active',
  'graduated',
  'transferred',
  'withdrawn'
);

CREATE TYPE public.profile_role AS ENUM (
  'admin',
  'finance',
  'teacher'
);

CREATE TYPE public.enrollment_status AS ENUM (
  'enrolled',
  'transferred',
  'withdrawn'
);

CREATE TYPE public.teacher_assignment_role AS ENUM (
  'homeroom',
  'subject'
);

CREATE TYPE public.discount_type AS ENUM (
  'percent',
  'fixed'
);

CREATE TYPE public.invoice_status AS ENUM (
  'unpaid',
  'partial',
  'paid'
);

CREATE TYPE public.payment_method AS ENUM (
  'cash',
  'transfer'
);

CREATE TYPE public.payment_status AS ENUM (
  'active',
  'voided'
);

-- ---------------------------------------------------------------------------
-- Utility
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- §3.1 Master tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_code text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  id_card text,
  status public.student_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT students_student_code_unique UNIQUE (student_code)
);

CREATE TRIGGER students_set_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.profile_role NOT NULL DEFAULT 'teacher',
  display_name text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.fee_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_tuition boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER fee_items_set_updated_at
  BEFORE UPDATE ON public.fee_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.receipt_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipt_types_code_unique UNIQUE (code)
);

CREATE TRIGGER receipt_types_set_updated_at
  BEFORE UPDATE ON public.receipt_types
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- §3.2 Year-scoped tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_years_dates_check CHECK (end_date >= start_date)
);

CREATE TRIGGER academic_years_set_updated_at
  BEFORE UPDATE ON public.academic_years
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years (id) ON DELETE RESTRICT,
  number smallint NOT NULL,
  name text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT semesters_number_check CHECK (number IN (1, 2)),
  CONSTRAINT semesters_dates_check CHECK (end_date >= start_date),
  CONSTRAINT semesters_academic_year_number_unique UNIQUE (academic_year_id, number)
);

CREATE TRIGGER semesters_set_updated_at
  BEFORE UPDATE ON public.semesters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.grade_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years (id) ON DELETE RESTRICT,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grade_levels_year_name_unique UNIQUE (academic_year_id, name)
);

CREATE TRIGGER grade_levels_set_updated_at
  BEFORE UPDATE ON public.grade_levels
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.classrooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years (id) ON DELETE RESTRICT,
  grade_level_id uuid NOT NULL REFERENCES public.grade_levels (id) ON DELETE RESTRICT,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classrooms_year_grade_name_unique UNIQUE (academic_year_id, grade_level_id, name)
);

CREATE TRIGGER classrooms_set_updated_at
  BEFORE UPDATE ON public.classrooms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.fee_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years (id) ON DELETE RESTRICT,
  semester_id uuid NOT NULL REFERENCES public.semesters (id) ON DELETE RESTRICT,
  grade_level_id uuid NOT NULL REFERENCES public.grade_levels (id) ON DELETE RESTRICT,
  fee_item_id uuid NOT NULL REFERENCES public.fee_items (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  receipt_type_id uuid REFERENCES public.receipt_types (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fee_rates_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT fee_rates_year_semester_grade_item_unique UNIQUE (
    academic_year_id,
    semester_id,
    grade_level_id,
    fee_item_id
  )
);

CREATE TRIGGER fee_rates_set_updated_at
  BEFORE UPDATE ON public.fee_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- §3.3 Junction tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students (id) ON DELETE RESTRICT,
  classroom_id uuid NOT NULL REFERENCES public.classrooms (id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years (id) ON DELETE RESTRICT,
  status public.enrollment_status NOT NULL DEFAULT 'enrolled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_enrollments_student_year_unique UNIQUE (student_id, academic_year_id)
);

CREATE TRIGGER student_enrollments_set_updated_at
  BEFORE UPDATE ON public.student_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.teacher_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  classroom_id uuid NOT NULL REFERENCES public.classrooms (id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years (id) ON DELETE RESTRICT,
  role public.teacher_assignment_role NOT NULL DEFAULT 'homeroom',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_assignments_profile_classroom_year_unique UNIQUE (
    profile_id,
    classroom_id,
    academic_year_id
  )
);

CREATE TRIGGER teacher_assignments_set_updated_at
  BEFORE UPDATE ON public.teacher_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- §3.4 Finance tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.student_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students (id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years (id) ON DELETE RESTRICT,
  semester_id uuid NOT NULL REFERENCES public.semesters (id) ON DELETE RESTRICT,
  invoice_name text NOT NULL,
  subtotal numeric(12, 2) NOT NULL DEFAULT 0,
  discount_type public.discount_type,
  discount_value numeric(12, 2),
  total_amount numeric(12, 2) NOT NULL DEFAULT 0,
  paid_amount numeric(12, 2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'unpaid',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_invoices_subtotal_non_negative CHECK (subtotal >= 0),
  CONSTRAINT student_invoices_total_non_negative CHECK (total_amount >= 0),
  CONSTRAINT student_invoices_paid_non_negative CHECK (paid_amount >= 0),
  CONSTRAINT student_invoices_discount_value_non_negative CHECK (
    discount_value IS NULL OR discount_value >= 0
  )
);

CREATE TRIGGER student_invoices_set_updated_at
  BEFORE UPDATE ON public.student_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.student_invoices (id) ON DELETE CASCADE,
  fee_item_id uuid NOT NULL REFERENCES public.fee_items (id) ON DELETE RESTRICT,
  description text NOT NULL DEFAULT '',
  amount numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_lines_amount_non_negative CHECK (amount >= 0)
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students (id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  payment_method public.payment_method NOT NULL,
  transfer_reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  note text,
  status public.payment_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_positive CHECK (amount > 0),
  CONSTRAINT payments_year_receipt_number_unique UNIQUE (academic_year_id, receipt_number)
);

CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.student_invoices (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_allocations_amount_positive CHECK (amount > 0),
  CONSTRAINT payment_allocations_payment_invoice_unique UNIQUE (payment_id, invoice_id)
);

CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  receipt_number text NOT NULL,
  receipt_type_id uuid NOT NULL REFERENCES public.receipt_types (id) ON DELETE RESTRICT,
  snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT receipts_payment_id_unique UNIQUE (payment_id)
);

CREATE TABLE public.payment_voids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  voided_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  voided_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  CONSTRAINT payment_voids_payment_id_unique UNIQUE (payment_id),
  CONSTRAINT payment_voids_reason_not_empty CHECK (length(trim(reason)) > 0)
);

-- ---------------------------------------------------------------------------
-- §3.5 Indexes (spec + FK helpers)
-- ---------------------------------------------------------------------------

CREATE INDEX idx_enrollments_year_classroom
  ON public.student_enrollments (academic_year_id, classroom_id);

CREATE INDEX idx_payments_year_date
  ON public.payments (academic_year_id, paid_at);

CREATE INDEX idx_invoices_student_year
  ON public.student_invoices (student_id, academic_year_id, semester_id);

CREATE INDEX idx_invoices_status
  ON public.student_invoices (academic_year_id, status);

CREATE INDEX idx_semesters_academic_year_id ON public.semesters (academic_year_id);
CREATE INDEX idx_grade_levels_academic_year_id ON public.grade_levels (academic_year_id);
CREATE INDEX idx_classrooms_academic_year_id ON public.classrooms (academic_year_id);
CREATE INDEX idx_classrooms_grade_level_id ON public.classrooms (grade_level_id);
CREATE INDEX idx_fee_rates_academic_year_id ON public.fee_rates (academic_year_id);
CREATE INDEX idx_teacher_assignments_profile_year
  ON public.teacher_assignments (profile_id, academic_year_id);
CREATE INDEX idx_teacher_assignments_classroom_year
  ON public.teacher_assignments (classroom_id, academic_year_id);
CREATE INDEX idx_invoice_lines_invoice_id ON public.invoice_lines (invoice_id);
CREATE INDEX idx_payment_allocations_invoice_id ON public.payment_allocations (invoice_id);
CREATE INDEX idx_payment_allocations_payment_id ON public.payment_allocations (payment_id);
CREATE INDEX idx_payments_student_id ON public.payments (student_id);
CREATE INDEX idx_students_status ON public.students (status);

-- ---------------------------------------------------------------------------
-- Auth: auto-create profile on signup
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1), ''),
    CASE
      WHEN NEW.raw_user_meta_data ->> 'role' IN ('admin', 'finance', 'teacher')
      THEN (NEW.raw_user_meta_data ->> 'role')::public.profile_role
      ELSE 'teacher'::public.profile_role
    END,
    COALESCE((NEW.raw_user_meta_data ->> 'is_active')::boolean, false)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- §5 RLS helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS public.profile_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
    AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_profile_role() = 'admin'::public.profile_role;
$$;

CREATE OR REPLACE FUNCTION public.is_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_profile_role() = 'finance'::public.profile_role;
$$;

CREATE OR REPLACE FUNCTION public.is_finance_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_profile_role() IN (
    'admin'::public.profile_role,
    'finance'::public.profile_role
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_access_student(
  p_student_id uuid,
  p_academic_year_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_assignments ta
    INNER JOIN public.student_enrollments se
      ON se.classroom_id = ta.classroom_id
      AND se.academic_year_id = ta.academic_year_id
    WHERE ta.profile_id = auth.uid()
      AND se.student_id = p_student_id
      AND (p_academic_year_id IS NULL OR ta.academic_year_id = p_academic_year_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_access_classroom(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_assignments ta
    WHERE ta.profile_id = auth.uid()
      AND ta.classroom_id = p_classroom_id
  );
$$;

-- ---------------------------------------------------------------------------
-- §5 Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_voids ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_select_staff ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_finance_or_admin());

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_admin_all ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- students (master)
CREATE POLICY students_admin_all ON public.students
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY students_finance_select ON public.students
  FOR SELECT TO authenticated
  USING (public.is_finance());

CREATE POLICY students_teacher_select ON public.students
  FOR SELECT TO authenticated
  USING (public.teacher_can_access_student(id));

-- fee_items, receipt_types (read all staff; write admin)
CREATE POLICY fee_items_select ON public.fee_items
  FOR SELECT TO authenticated
  USING (public.current_profile_role() IS NOT NULL);

CREATE POLICY fee_items_admin_write ON public.fee_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY receipt_types_select ON public.receipt_types
  FOR SELECT TO authenticated
  USING (public.current_profile_role() IS NOT NULL);

CREATE POLICY receipt_types_admin_write ON public.receipt_types
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- academic structure (admin write; all active staff read)
CREATE POLICY academic_years_select ON public.academic_years
  FOR SELECT TO authenticated
  USING (public.current_profile_role() IS NOT NULL);

CREATE POLICY academic_years_admin_write ON public.academic_years
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY semesters_select ON public.semesters
  FOR SELECT TO authenticated
  USING (public.current_profile_role() IS NOT NULL);

CREATE POLICY semesters_admin_write ON public.semesters
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY grade_levels_select ON public.grade_levels
  FOR SELECT TO authenticated
  USING (public.current_profile_role() IS NOT NULL);

CREATE POLICY grade_levels_admin_write ON public.grade_levels
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY classrooms_select ON public.classrooms
  FOR SELECT TO authenticated
  USING (public.current_profile_role() IS NOT NULL);

CREATE POLICY classrooms_admin_write ON public.classrooms
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY fee_rates_select ON public.fee_rates
  FOR SELECT TO authenticated
  USING (public.current_profile_role() IS NOT NULL);

CREATE POLICY fee_rates_admin_write ON public.fee_rates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- enrollments
CREATE POLICY student_enrollments_admin_all ON public.student_enrollments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY student_enrollments_finance_select ON public.student_enrollments
  FOR SELECT TO authenticated
  USING (public.is_finance());

CREATE POLICY student_enrollments_teacher_select ON public.student_enrollments
  FOR SELECT TO authenticated
  USING (public.teacher_can_access_classroom(classroom_id));

-- teacher assignments
CREATE POLICY teacher_assignments_admin_all ON public.teacher_assignments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY teacher_assignments_teacher_select_own ON public.teacher_assignments
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY teacher_assignments_finance_select ON public.teacher_assignments
  FOR SELECT TO authenticated
  USING (public.is_finance());

-- finance: invoices
CREATE POLICY student_invoices_admin_all ON public.student_invoices
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY student_invoices_finance_all ON public.student_invoices
  FOR ALL TO authenticated
  USING (public.is_finance())
  WITH CHECK (public.is_finance());

CREATE POLICY student_invoices_teacher_select ON public.student_invoices
  FOR SELECT TO authenticated
  USING (
    public.teacher_can_access_student(student_id, academic_year_id)
  );

CREATE POLICY invoice_lines_admin_all ON public.invoice_lines
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY invoice_lines_finance_all ON public.invoice_lines
  FOR ALL TO authenticated
  USING (public.is_finance())
  WITH CHECK (public.is_finance());

CREATE POLICY invoice_lines_teacher_select ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.student_invoices si
      WHERE si.id = invoice_id
        AND public.teacher_can_access_student(si.student_id, si.academic_year_id)
    )
  );

-- payments & receipts (admin + finance write; teacher read scoped)
CREATE POLICY payments_admin_all ON public.payments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY payments_finance_all ON public.payments
  FOR ALL TO authenticated
  USING (public.is_finance())
  WITH CHECK (public.is_finance());

CREATE POLICY payments_teacher_select ON public.payments
  FOR SELECT TO authenticated
  USING (public.teacher_can_access_student(student_id, academic_year_id));

CREATE POLICY payment_allocations_admin_all ON public.payment_allocations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY payment_allocations_finance_all ON public.payment_allocations
  FOR ALL TO authenticated
  USING (public.is_finance())
  WITH CHECK (public.is_finance());

CREATE POLICY payment_allocations_teacher_select ON public.payment_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.id = payment_id
        AND public.teacher_can_access_student(p.student_id, p.academic_year_id)
    )
  );

CREATE POLICY receipts_admin_all ON public.receipts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY receipts_finance_all ON public.receipts
  FOR ALL TO authenticated
  USING (public.is_finance())
  WITH CHECK (public.is_finance());

CREATE POLICY receipts_teacher_select ON public.receipts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.id = payment_id
        AND public.teacher_can_access_student(p.student_id, p.academic_year_id)
    )
  );

CREATE POLICY payment_voids_admin_all ON public.payment_voids
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY payment_voids_finance_all ON public.payment_voids
  FOR ALL TO authenticated
  USING (public.is_finance())
  WITH CHECK (public.is_finance());

CREATE POLICY payment_voids_teacher_select ON public.payment_voids
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.id = payment_id
        AND public.teacher_can_access_student(p.student_id, p.academic_year_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Grants (authenticated API access via RLS)
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_access_student(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_access_classroom(uuid) TO authenticated;

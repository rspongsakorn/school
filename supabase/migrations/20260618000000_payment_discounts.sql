-- Payment-time discounts: per fee line, recorded at the moment of payment.
CREATE TABLE public.payment_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  invoice_line_id uuid NOT NULL REFERENCES public.invoice_lines (id) ON DELETE RESTRICT,
  fee_item_id uuid NOT NULL REFERENCES public.fee_items (id) ON DELETE RESTRICT,
  discount_type public.discount_type NOT NULL,
  discount_value numeric(12, 2) NOT NULL,
  amount numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_discounts_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT payment_discounts_value_non_negative CHECK (discount_value >= 0)
);

CREATE INDEX idx_payment_discounts_payment_id ON public.payment_discounts (payment_id);
CREATE INDEX idx_payment_discounts_fee_item_id ON public.payment_discounts (fee_item_id);

ALTER TABLE public.payment_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_discounts_admin_all ON public.payment_discounts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY payment_discounts_finance_all ON public.payment_discounts
  FOR ALL TO authenticated
  USING (public.is_finance())
  WITH CHECK (public.is_finance());

CREATE POLICY payment_discounts_teacher_select ON public.payment_discounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.id = payment_id
        AND public.teacher_can_access_student(p.student_id, p.academic_year_id)
    )
  );

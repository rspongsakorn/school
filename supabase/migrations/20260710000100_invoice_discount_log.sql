-- A fully-written-off historical invoice (e.g. insurance fee waived via a
-- "-200" cell in the XLSX import) gets no payment/receipt — a receipt means
-- cash was received, and payments.amount must be > 0 (payments_amount_positive).
-- This table is the only record of *why* such an invoice reads "paid" with
-- ฿0 collected, since student_invoices itself has no note/reason field.
CREATE TABLE public.invoice_discount_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.student_invoices (id) ON DELETE RESTRICT,
  discount_value numeric(12, 2) NOT NULL,
  note text,
  recorded_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_discount_log_value_positive CHECK (discount_value > 0)
);

CREATE INDEX idx_invoice_discount_log_invoice_id ON public.invoice_discount_log (invoice_id);

ALTER TABLE public.invoice_discount_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_discount_log_admin_all ON public.invoice_discount_log
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY invoice_discount_log_finance_all ON public.invoice_discount_log
  FOR ALL TO authenticated
  USING (public.is_finance())
  WITH CHECK (public.is_finance());

-- Writes off an invoice with zero cash collected: sets a fixed discount that
-- brings total_amount to (subtotal - discount_value), marks the invoice paid
-- at paid_amount = 0 (student_invoices.status logic already treats
-- paid_amount >= total_amount as 'paid'; 0 >= 0 holds when fully written off),
-- and logs why. No payments/receipts row is created — see file header above.
CREATE OR REPLACE FUNCTION public.record_backfill_invoice_discount(
  p_invoice_id uuid,
  p_discount_value numeric,
  p_note text,
  p_recorded_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_subtotal numeric;
  v_paid_amount numeric;
  v_new_total numeric;
  v_status public.invoice_status;
BEGIN
  IF NOT (public.is_admin() OR public.is_finance()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_discount_value IS NULL OR p_discount_value <= 0 THEN
    RAISE EXCEPTION 'p_discount_value must be positive' USING ERRCODE = '22023';
  END IF;

  SELECT subtotal, paid_amount
    INTO v_subtotal, v_paid_amount
    FROM public.student_invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found' USING ERRCODE = 'P0002';
  END IF;

  v_new_total := GREATEST(v_subtotal - p_discount_value, 0);
  v_status := CASE
    WHEN v_paid_amount <= 0 AND v_new_total <= 0 THEN 'paid'
    WHEN v_paid_amount <= 0 THEN 'unpaid'
    WHEN v_paid_amount < v_new_total THEN 'partial'
    ELSE 'paid'
  END;

  UPDATE public.student_invoices
     SET discount_type = 'fixed',
         discount_value = p_discount_value,
         total_amount = v_new_total,
         status = v_status
   WHERE id = p_invoice_id;

  INSERT INTO public.invoice_discount_log (invoice_id, discount_value, note, recorded_by)
  VALUES (p_invoice_id, p_discount_value, p_note, p_recorded_by);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_backfill_invoice_discount(
  uuid, numeric, text, uuid
) TO authenticated;

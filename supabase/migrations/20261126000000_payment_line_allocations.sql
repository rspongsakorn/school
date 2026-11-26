-- Pay by line: a payment records which invoice lines it settled, so a partial
-- payment says what was paid instead of spreading the amount over every line.
--
-- A line is either fully paid by one payment or unpaid; there is no partial
-- line payment. Paid state is derived from rows of active payments, so voiding
-- a payment returns its lines to "owed" without touching anything else.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE public.payment_line_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  invoice_line_id uuid NOT NULL REFERENCES public.invoice_lines (id) ON DELETE RESTRICT,
  -- Line amount minus the discount given on that line in the same payment.
  amount numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_line_allocations_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT payment_line_allocations_payment_line_unique UNIQUE (payment_id, invoice_line_id)
);

CREATE INDEX idx_payment_line_allocations_payment_id
  ON public.payment_line_allocations (payment_id);
CREATE INDEX idx_payment_line_allocations_invoice_line_id
  ON public.payment_line_allocations (invoice_line_id);

ALTER TABLE public.payment_line_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_line_allocations_admin_all ON public.payment_line_allocations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY payment_line_allocations_finance_all ON public.payment_line_allocations
  FOR ALL TO authenticated
  USING (public.is_finance())
  WITH CHECK (public.is_finance());

CREATE POLICY payment_line_allocations_teacher_select ON public.payment_line_allocations
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
-- Line states
--
-- One row per line of each requested invoice.
--   is_paid          the line is 0 baht, or an active payment settled it
--   invoice_tracked  the invoice has no invoice-level discount and every active
--                    payment on it recorded its lines. An untracked ("legacy")
--                    invoice was partly paid before lines were recorded, so
--                    which lines are owed is unknown; it keeps amount entry.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invoice_line_states(p_invoice_ids uuid[])
RETURNS TABLE (
  invoice_id uuid,
  invoice_line_id uuid,
  description text,
  amount numeric,
  is_paid boolean,
  invoice_tracked boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH inv AS (
    SELECT si.id,
           coalesce(si.discount_value, 0) = 0
           AND NOT EXISTS (
             SELECT 1
               FROM public.payment_allocations pa
               JOIN public.payments p ON p.id = pa.payment_id AND p.status = 'active'
              WHERE pa.invoice_id = si.id
                AND NOT EXISTS (
                  SELECT 1
                    FROM public.payment_line_allocations pla
                    JOIN public.invoice_lines il2 ON il2.id = pla.invoice_line_id
                   WHERE pla.payment_id = pa.payment_id
                     AND il2.invoice_id = si.id
                )
           ) AS tracked
      FROM public.student_invoices si
     WHERE si.id = ANY (p_invoice_ids)
  )
  SELECT il.invoice_id,
         il.id,
         il.description,
         il.amount,
         il.amount = 0 OR EXISTS (
           SELECT 1
             FROM public.payment_line_allocations pla
             JOIN public.payments p ON p.id = pla.payment_id AND p.status = 'active'
            WHERE pla.invoice_line_id = il.id
         ),
         inv.tracked
    FROM public.invoice_lines il
    JOIN inv ON inv.id = il.invoice_id
$$;

GRANT EXECUTE ON FUNCTION public.invoice_line_states(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- record_payment: optional line selection
--
-- Same body as 20260703000000_record_payment_validation.sql, plus
-- p_line_ids. A tracked invoice must be paid by lines; a legacy one must not.
-- ---------------------------------------------------------------------------

DROP FUNCTION public.record_payment(
  uuid, uuid, uuid, text, numeric, numeric, numeric,
  public.payment_method, text, text, uuid, uuid, jsonb, jsonb
);

CREATE FUNCTION public.record_payment(
  p_invoice_id uuid,
  p_student_id uuid,
  p_academic_year_id uuid,
  p_academic_year_name text,
  p_amount numeric,
  p_net_total numeric,
  p_new_paid numeric,
  p_payment_method public.payment_method,
  p_transfer_reference text,
  p_note text,
  p_recorded_by uuid,
  p_invoice_type_id uuid,
  p_snapshot jsonb,
  p_discounts jsonb,
  p_line_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (payment_id uuid, receipt_number text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_seq int;
  v_receipt text;
  v_payment_id uuid;
  v_status public.invoice_status;
  v_paid_amount numeric;
  v_invoice_student uuid;
  v_tracked boolean;
  v_discounts jsonb := coalesce(p_discounts, '[]'::jsonb);
  v_expected numeric;
BEGIN
  IF NOT (public.is_admin() OR public.is_finance()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  -- Invariants: guard against inconsistent money values from any caller.
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_net_total IS NULL OR p_net_total < 0 THEN
    RAISE EXCEPTION 'p_net_total must be non-negative' USING ERRCODE = '22023';
  END IF;

  -- Lock the invoice row and read its authoritative state. Holding this lock
  -- also serialises line selection: two payments can't both settle one line.
  SELECT student_id, paid_amount
    INTO v_invoice_student, v_paid_amount
    FROM public.student_invoices
   WHERE id = p_invoice_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invoice_student <> p_student_id THEN
    RAISE EXCEPTION 'invoice does not belong to student' USING ERRCODE = '22023';
  END IF;
  IF round(p_new_paid, 2) <> round(v_paid_amount + p_amount, 2) THEN
    RAISE EXCEPTION 'p_new_paid must equal current paid_amount + p_amount'
      USING ERRCODE = '22023';
  END IF;
  IF round(p_new_paid, 2) > round(p_net_total, 2) THEN
    RAISE EXCEPTION 'payment would overpay the invoice' USING ERRCODE = '22023';
  END IF;

  -- Line selection rules.
  SELECT coalesce(bool_and(s.invoice_tracked), false)
    INTO v_tracked
    FROM public.invoice_line_states(ARRAY[p_invoice_id]) s;

  IF v_tracked AND p_line_ids IS NULL THEN
    RAISE EXCEPTION 'line selection required for this invoice' USING ERRCODE = '22023';
  END IF;
  IF NOT v_tracked AND p_line_ids IS NOT NULL THEN
    RAISE EXCEPTION 'this invoice does not take a line selection' USING ERRCODE = '22023';
  END IF;

  IF p_line_ids IS NOT NULL THEN
    IF cardinality(p_line_ids) = 0 THEN
      RAISE EXCEPTION 'line selection is empty' USING ERRCODE = '22023';
    END IF;
    IF cardinality(p_line_ids) <> (SELECT count(DISTINCT x) FROM unnest(p_line_ids) AS x) THEN
      RAISE EXCEPTION 'line selection has duplicates' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM unnest(p_line_ids) AS sel(id)
       WHERE NOT EXISTS (
         SELECT 1
           FROM public.invoice_line_states(ARRAY[p_invoice_id]) s
          WHERE s.invoice_line_id = sel.id
            AND NOT s.is_paid
       )
    ) THEN
      RAISE EXCEPTION 'line not payable' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM jsonb_array_elements(v_discounts) AS d
       WHERE NOT ((d->>'invoiceLineId')::uuid = ANY (p_line_ids))
    ) THEN
      RAISE EXCEPTION 'discount on an unselected line' USING ERRCODE = '22023';
    END IF;

    SELECT coalesce(sum(il.amount), 0)
           - coalesce((
               SELECT sum((d->>'amount')::numeric)
                 FROM jsonb_array_elements(v_discounts) AS d
             ), 0)
      INTO v_expected
      FROM public.invoice_lines il
     WHERE il.id = ANY (p_line_ids);

    IF round(p_amount, 2) <> round(v_expected, 2) THEN
      RAISE EXCEPTION 'amount does not match selected lines' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Serialize receipt numbering per academic year within this transaction so
  -- concurrent payments can't read the same max sequence.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_academic_year_id::text, 0));

  SELECT coalesce(max((split_part(p.receipt_number, '/', 2))::int), 0) + 1
    INTO v_seq
    FROM public.payments p
   WHERE p.academic_year_id = p_academic_year_id;

  v_receipt := p_academic_year_name || '/' || lpad(v_seq::text, 5, '0');

  INSERT INTO public.payments (
    receipt_number, student_id, academic_year_id, amount,
    payment_method, transfer_reference, recorded_by, note, status
  )
  VALUES (
    v_receipt, p_student_id, p_academic_year_id, p_amount,
    p_payment_method, p_transfer_reference, p_recorded_by, p_note, 'active'
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.payment_allocations (payment_id, invoice_id, amount)
  VALUES (v_payment_id, p_invoice_id, p_amount);

  IF p_line_ids IS NOT NULL THEN
    INSERT INTO public.payment_line_allocations (payment_id, invoice_line_id, amount)
    SELECT v_payment_id,
           il.id,
           il.amount - coalesce((
             SELECT sum((d->>'amount')::numeric)
               FROM jsonb_array_elements(v_discounts) AS d
              WHERE (d->>'invoiceLineId')::uuid = il.id
           ), 0)
      FROM public.invoice_lines il
     WHERE il.id = ANY (p_line_ids);
  END IF;

  IF jsonb_array_length(v_discounts) > 0 THEN
    INSERT INTO public.payment_discounts (
      payment_id, invoice_line_id, fee_item_id, discount_type, discount_value, amount
    )
    SELECT
      v_payment_id,
      (d->>'invoiceLineId')::uuid,
      (d->>'feeItemId')::uuid,
      (d->>'discountType')::public.discount_type,
      (d->>'discountValue')::numeric,
      (d->>'amount')::numeric
    FROM jsonb_array_elements(v_discounts) AS d;
  END IF;

  INSERT INTO public.receipts (payment_id, receipt_number, invoice_type_id, snapshot_data)
  VALUES (
    v_payment_id,
    v_receipt,
    p_invoice_type_id,
    -- Stamp the transaction-issued receipt number into the snapshot so it can
    -- never disagree with the payments/receipts rows.
    p_snapshot || jsonb_build_object('receiptNumber', v_receipt)
  );

  v_status := CASE
    WHEN p_new_paid <= 0 THEN 'unpaid'
    WHEN p_new_paid < p_net_total THEN 'partial'
    ELSE 'paid'
  END;

  UPDATE public.student_invoices
     SET paid_amount = p_new_paid,
         total_amount = p_net_total,
         status = v_status
   WHERE id = p_invoice_id;

  RETURN QUERY SELECT v_payment_id, v_receipt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_payment(
  uuid, uuid, uuid, text, numeric, numeric, numeric,
  public.payment_method, text, text, uuid, uuid, jsonb, jsonb, uuid[]
) TO authenticated;

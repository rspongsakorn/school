-- Extend record_backfill_payment so a single historical-payment RPC call can
-- also apply a discount to the invoice it's paying (used by the XLSX import:
-- a row can be partly cash, partly a write-off against the SAME invoice —
-- e.g. เอกสาร 400 collected, ค่าประกัน -200 discounted, on one invoice).
--
-- The two new params are optional (DEFAULT NULL) so existing callers
-- (CSV backfill import) are unaffected.

CREATE OR REPLACE FUNCTION public.record_backfill_payment(
  p_student_id uuid,
  p_academic_year_id uuid,
  p_academic_year_name text,
  p_amount numeric,
  p_paid_at timestamptz,
  p_recorded_by uuid,
  p_note text,
  p_invoice_type_id uuid,
  p_snapshot jsonb,
  p_allocations jsonb,
  p_discount_invoice_id uuid DEFAULT NULL,
  p_discount_value numeric DEFAULT NULL
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
  v_alloc_total numeric;
  v_alloc jsonb;
  v_invoice_id uuid;
  v_alloc_amount numeric;
  v_paid_amount numeric;
  v_total_amount numeric;
  v_invoice_student uuid;
  v_new_paid numeric;
  v_status public.invoice_status;
BEGIN
  IF NOT (public.is_admin() OR public.is_finance()) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount must be positive' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(coalesce(p_allocations, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'p_allocations must be non-empty' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum((a->>'amount')::numeric), 0)
    INTO v_alloc_total
    FROM jsonb_array_elements(p_allocations) AS a;
  IF round(v_alloc_total, 2) <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'allocations must sum to p_amount' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_academic_year_id::text, 0));

  -- Apply the discount (if any) BEFORE the allocation loop below re-reads
  -- total_amount, so the overpay/status derivation sees the post-discount total.
  IF p_discount_invoice_id IS NOT NULL AND p_discount_value IS NOT NULL AND p_discount_value > 0 THEN
    UPDATE public.student_invoices
       SET discount_type = 'fixed',
           discount_value = p_discount_value,
           total_amount = GREATEST(subtotal - p_discount_value, 0)
     WHERE id = p_discount_invoice_id
       AND student_id = p_student_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'discount invoice not found or does not belong to student' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT coalesce(max((split_part(p.receipt_number, '/', 2))::int), 0) + 1
    INTO v_seq
    FROM public.payments p
   WHERE p.academic_year_id = p_academic_year_id;

  v_receipt := p_academic_year_name || '/' || lpad(v_seq::text, 5, '0');

  INSERT INTO public.payments (
    receipt_number, student_id, academic_year_id, amount,
    payment_method, transfer_reference, paid_at, recorded_by, note, status
  )
  VALUES (
    v_receipt, p_student_id, p_academic_year_id, p_amount,
    'cash', NULL, p_paid_at, p_recorded_by, p_note, 'active'
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.receipts (payment_id, receipt_number, invoice_type_id, snapshot_data)
  VALUES (
    v_payment_id,
    v_receipt,
    p_invoice_type_id,
    p_snapshot || jsonb_build_object('receiptNumber', v_receipt)
  );

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_invoice_id := (v_alloc->>'invoiceId')::uuid;
    v_alloc_amount := (v_alloc->>'amount')::numeric;

    IF v_alloc_amount IS NULL OR v_alloc_amount <= 0 THEN
      RAISE EXCEPTION 'allocation amount must be positive' USING ERRCODE = '22023';
    END IF;

    SELECT student_id, paid_amount, total_amount
      INTO v_invoice_student, v_paid_amount, v_total_amount
      FROM public.student_invoices
     WHERE id = v_invoice_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invoice not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_invoice_student <> p_student_id THEN
      RAISE EXCEPTION 'invoice does not belong to student' USING ERRCODE = '22023';
    END IF;

    v_new_paid := round(v_paid_amount + v_alloc_amount, 2);
    IF v_new_paid > round(v_total_amount, 2) THEN
      RAISE EXCEPTION 'allocation would overpay invoice' USING ERRCODE = '22023';
    END IF;

    v_status := CASE
      WHEN v_new_paid <= 0 THEN 'unpaid'
      WHEN v_new_paid < v_total_amount THEN 'partial'
      ELSE 'paid'
    END;

    INSERT INTO public.payment_allocations (payment_id, invoice_id, amount)
    VALUES (v_payment_id, v_invoice_id, v_alloc_amount);

    UPDATE public.student_invoices
       SET paid_amount = v_new_paid,
           status = v_status
     WHERE id = v_invoice_id;
  END LOOP;

  RETURN QUERY SELECT v_payment_id, v_receipt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_backfill_payment(
  uuid, uuid, text, numeric, timestamptz, uuid, text, uuid, jsonb, jsonb, uuid, numeric
) TO authenticated;

-- Atomic backfill payment recording (historical CSV import).
--
-- importPaymentsBackfill previously inserted payment -> allocations -> receipt
-- and then updated each invoice as separate PostgREST calls with best-effort
-- compensating deletes, and computed the receipt sequence from a snapshot read
-- outside any lock. That is the exact non-atomic, race-prone pattern the
-- record_payment RPC was created to eliminate — a crash after the receipt
-- insert leaves a committed receipt against a stale invoice balance, and two
-- concurrent imports can compute the same sequence.
--
-- This function records one historical payment (which may settle several
-- invoices FIFO) in a single transaction: it issues the receipt number under
-- the same per-academic-year advisory lock, writes the payment/allocations/
-- receipt, and updates each invoice's balance, deriving paid_amount and status
-- from the invoice's own current state so callers can't desync it.
--
-- p_allocations: jsonb array of { "invoiceId": uuid, "amount": numeric }.

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
  p_allocations jsonb
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

  -- The allocation amounts must add up to the payment amount.
  SELECT coalesce(sum((a->>'amount')::numeric), 0)
    INTO v_alloc_total
    FROM jsonb_array_elements(p_allocations) AS a;
  IF round(v_alloc_total, 2) <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'allocations must sum to p_amount' USING ERRCODE = '22023';
  END IF;

  -- Serialize receipt numbering per academic year within this transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_academic_year_id::text, 0));

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

  -- Apply each allocation, deriving the new balance and status from the
  -- invoice's own locked state so the caller can't overpay or desync it.
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
  uuid, uuid, text, numeric, timestamptz, uuid, text, uuid, jsonb, jsonb
) TO authenticated;

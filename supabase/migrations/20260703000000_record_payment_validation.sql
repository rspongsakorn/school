-- Harden record_payment with server-side invariant checks.
--
-- The function previously trusted every money value from the caller
-- (p_amount, p_net_total, p_new_paid) and never verified the invoice belonged
-- to the student. All correctness lived in the single TypeScript caller, so a
-- second caller or a malformed call could write an inconsistent balance.
--
-- This re-defines the function with the same behaviour plus cheap guards that
-- make the transaction self-validating: the amount must be positive, the
-- invoice must belong to the student, and p_new_paid must equal the invoice's
-- current paid_amount plus p_amount (so the caller can't silently desync the
-- balance). Money math is unchanged.

CREATE OR REPLACE FUNCTION public.record_payment(
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
  p_discounts jsonb
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

  -- Lock the invoice row and read its authoritative state.
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

  IF jsonb_array_length(coalesce(p_discounts, '[]'::jsonb)) > 0 THEN
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
    FROM jsonb_array_elements(p_discounts) AS d;
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

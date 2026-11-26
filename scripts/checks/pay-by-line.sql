-- Assertions for pay-by-line (20261126000000_payment_line_allocations.sql).
--
-- Run inside a rolled-back transaction against the TEST database only:
--   node scripts/db-query.mjs .env.school --rollback -f scripts/checks/pay-by-line.sql
-- Passes when it ends with NOTICE "pay-by-line checks passed".

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1))::text,
  true
);

DO $$
DECLARE
  v_admin uuid := (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1);
  v_inv record;
  v_year_name text;
  l1 uuid; l2 uuid; l3 uuid;
  a1 numeric; a2 numeric; a3 numeric;
  v_fee1 uuid;
  v_pay12 uuid;
  v_zero uuid;
  v_failed boolean;
  v_n int;
  v_status text;
  v_err text;

  -- Calls record_payment against the current invoice state.
  -- Returns the payment id.
BEGIN
  SELECT si.*
    INTO v_inv
    FROM public.student_invoices si
   WHERE si.status = 'unpaid'
     AND si.paid_amount = 0
     AND coalesce(si.discount_value, 0) = 0
     AND si.invoice_type_id IS NOT NULL
     AND round(si.total_amount, 2) = round(si.subtotal, 2)
     AND NOT EXISTS (SELECT 1 FROM public.payment_allocations pa WHERE pa.invoice_id = si.id)
     AND (SELECT count(*) FROM public.invoice_lines il WHERE il.invoice_id = si.id AND il.amount > 0) >= 3
     AND NOT EXISTS (SELECT 1 FROM public.invoice_lines il WHERE il.invoice_id = si.id AND il.amount = 0)
   LIMIT 1;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'CHECK SETUP: no unpaid invoice with 3+ lines found';
  END IF;

  SELECT name INTO v_year_name FROM public.academic_years WHERE id = v_inv.academic_year_id;

  SELECT id, amount, fee_item_id INTO l1, a1, v_fee1
    FROM public.invoice_lines WHERE invoice_id = v_inv.id ORDER BY amount, id LIMIT 1 OFFSET 0;
  SELECT id, amount INTO l2, a2
    FROM public.invoice_lines WHERE invoice_id = v_inv.id ORDER BY amount, id LIMIT 1 OFFSET 1;
  SELECT id, amount INTO l3, a3
    FROM public.invoice_lines WHERE invoice_id = v_inv.id ORDER BY amount, id LIMIT 1 OFFSET 2;

  -- 1. fresh invoice: every line owed, invoice tracked
  IF EXISTS (SELECT 1 FROM public.invoice_line_states(ARRAY[v_inv.id]) WHERE is_paid OR NOT invoice_tracked) THEN
    RAISE EXCEPTION 'CHECK FAILED 1: fresh invoice should be tracked with all lines owed';
  END IF;

  -- 2. tracked invoice refuses a payment without a line selection
  v_failed := false;
  BEGIN
    PERFORM public.record_payment(
      v_inv.id, v_inv.student_id, v_inv.academic_year_id, v_year_name,
      a1, v_inv.total_amount, a1, 'cash', NULL, NULL, v_admin,
      v_inv.invoice_type_id, '{}'::jsonb, '[]'::jsonb, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_failed := SQLERRM = 'line selection required for this invoice';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'CHECK FAILED 2: NULL line selection accepted (err: %)', v_err; END IF;

  -- 3. pay lines 1+2
  SELECT payment_id INTO v_pay12 FROM public.record_payment(
    v_inv.id, v_inv.student_id, v_inv.academic_year_id, v_year_name,
    a1 + a2, v_inv.total_amount, a1 + a2, 'cash', NULL, NULL, v_admin,
    v_inv.invoice_type_id, '{}'::jsonb, '[]'::jsonb, ARRAY[l1, l2]);
  SELECT count(*) INTO v_n FROM public.payment_line_allocations WHERE payment_id = v_pay12;
  IF v_n <> 2 THEN RAISE EXCEPTION 'CHECK FAILED 3: expected 2 line rows, got %', v_n; END IF;
  IF (SELECT is_paid FROM public.invoice_line_states(ARRAY[v_inv.id]) WHERE invoice_line_id = l3) THEN
    RAISE EXCEPTION 'CHECK FAILED 3: line 3 should still be owed';
  END IF;
  SELECT status INTO v_status FROM public.student_invoices WHERE id = v_inv.id;
  IF v_status <> 'partial' THEN RAISE EXCEPTION 'CHECK FAILED 3: status %', v_status; END IF;

  -- 4. paying line 1 again is refused
  v_failed := false;
  BEGIN
    PERFORM public.record_payment(
      v_inv.id, v_inv.student_id, v_inv.academic_year_id, v_year_name,
      a1, v_inv.total_amount, a1 + a2 + a1, 'cash', NULL, NULL, v_admin,
      v_inv.invoice_type_id, '{}'::jsonb, '[]'::jsonb, ARRAY[l1]);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_failed := SQLERRM = 'line not payable';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'CHECK FAILED 4: line paid twice (err: %)', v_err; END IF;

  -- 5. wrong amount for line 3 is refused
  v_failed := false;
  BEGIN
    PERFORM public.record_payment(
      v_inv.id, v_inv.student_id, v_inv.academic_year_id, v_year_name,
      a3 - 1, v_inv.total_amount, a1 + a2 + a3 - 1, 'cash', NULL, NULL, v_admin,
      v_inv.invoice_type_id, '{}'::jsonb, '[]'::jsonb, ARRAY[l3]);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_failed := SQLERRM = 'amount does not match selected lines';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'CHECK FAILED 5: wrong amount accepted (err: %)', v_err; END IF;

  -- 6. a discount on a line that is not selected is refused
  v_failed := false;
  BEGIN
    PERFORM public.record_payment(
      v_inv.id, v_inv.student_id, v_inv.academic_year_id, v_year_name,
      a3, v_inv.total_amount, a1 + a2 + a3, 'cash', NULL, NULL, v_admin,
      v_inv.invoice_type_id, '{}'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'invoiceLineId', l1, 'feeItemId', v_fee1, 'discountType', 'fixed',
        'discountValue', 1, 'amount', 1)),
      ARRAY[l3]);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_failed := SQLERRM = 'discount on an unselected line';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'CHECK FAILED 6: discount on unselected line accepted (err: %)', v_err; END IF;

  -- 10. what bulk sends: the remaining line at the remaining amount
  PERFORM public.record_payment(
    v_inv.id, v_inv.student_id, v_inv.academic_year_id, v_year_name,
    v_inv.total_amount - (a1 + a2), v_inv.total_amount, v_inv.total_amount, 'cash', NULL, NULL, v_admin,
    v_inv.invoice_type_id, '{}'::jsonb, '[]'::jsonb,
    ARRAY(SELECT invoice_line_id FROM public.invoice_line_states(ARRAY[v_inv.id]) WHERE NOT is_paid));
  SELECT status INTO v_status FROM public.student_invoices WHERE id = v_inv.id;
  IF v_status <> 'paid' THEN RAISE EXCEPTION 'CHECK FAILED 10: status % after paying the rest', v_status; END IF;

  -- 7. void the lines-1+2 payment (as voidPayment does): those lines are owed again
  UPDATE public.payments SET status = 'voided' WHERE id = v_pay12;
  UPDATE public.student_invoices
     SET paid_amount = paid_amount - (a1 + a2), status = 'partial'
   WHERE id = v_inv.id;
  IF (SELECT count(*) FROM public.invoice_line_states(ARRAY[v_inv.id])
       WHERE invoice_line_id IN (l1, l2) AND NOT is_paid) <> 2 THEN
    RAISE EXCEPTION 'CHECK FAILED 7: voided lines not owed again';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoice_line_states(ARRAY[v_inv.id]) WHERE NOT invoice_tracked) THEN
    RAISE EXCEPTION 'CHECK FAILED 7: invoice stopped being tracked after a void';
  END IF;

  -- 8. a zero-baht line counts as paid
  INSERT INTO public.invoice_lines (invoice_id, fee_item_id, description, amount)
  VALUES (v_inv.id, v_fee1, 'zero line', 0)
  RETURNING id INTO v_zero;
  IF NOT (SELECT is_paid FROM public.invoice_line_states(ARRAY[v_inv.id]) WHERE invoice_line_id = v_zero) THEN
    RAISE EXCEPTION 'CHECK FAILED 8: zero line shown as owed';
  END IF;

  -- 9. an invoice-level discount makes the invoice legacy, which refuses lines
  UPDATE public.student_invoices SET discount_value = 100 WHERE id = v_inv.id;
  IF EXISTS (SELECT 1 FROM public.invoice_line_states(ARRAY[v_inv.id]) WHERE invoice_tracked) THEN
    RAISE EXCEPTION 'CHECK FAILED 9: discounted invoice still tracked';
  END IF;
  v_failed := false;
  BEGIN
    PERFORM public.record_payment(
      v_inv.id, v_inv.student_id, v_inv.academic_year_id, v_year_name,
      a1, v_inv.total_amount, v_inv.total_amount - a2, 'cash', NULL, NULL, v_admin,
      v_inv.invoice_type_id, '{}'::jsonb, '[]'::jsonb, ARRAY[l1]);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    v_failed := SQLERRM = 'this invoice does not take a line selection';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'CHECK FAILED 9: legacy invoice took a line selection (err: %)', v_err; END IF;

  RAISE NOTICE 'pay-by-line checks passed';
END;
$$;

-- fee_items: per-item flag for dual pricing
ALTER TABLE public.fee_items
  ADD COLUMN has_reimbursable_variant boolean NOT NULL DEFAULT false;

-- fee_rates: optional reimbursable price (nullable, fallback to amount)
ALTER TABLE public.fee_rates
  ADD COLUMN amount_reimbursable numeric(10,2);

-- student_invoices: per-invoice variant flag
ALTER TABLE public.student_invoices
  ADD COLUMN is_reimbursable boolean NOT NULL DEFAULT false;

-- invoice_lines: snapshot of which variant was used
ALTER TABLE public.invoice_lines
  ADD COLUMN variant text NOT NULL DEFAULT 'standard'
    CHECK (variant IN ('standard', 'reimbursable'));

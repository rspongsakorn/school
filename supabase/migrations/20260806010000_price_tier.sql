-- Third price tier: "เอกชน" (private-school teacher reimbursable).
-- Replaces the two-state is_reimbursable boolean with a three-state price_tier.
-- Amounts on existing invoices are untouched: only status values are mapped.

-- fee_rates: third price. NULL = fall back to `amount` (same rule as
-- amount_reimbursable).
ALTER TABLE public.fee_rates
  ADD COLUMN amount_private numeric(12,2);

ALTER TABLE public.fee_rates
  ADD CONSTRAINT fee_rates_amount_private_non_negative
    CHECK (amount_private IS NULL OR amount_private >= 0);

-- students: boolean -> three-state tier
ALTER TABLE public.students
  ADD COLUMN price_tier text NOT NULL DEFAULT 'standard'
    CHECK (price_tier IN ('standard', 'reimbursable', 'private'));

UPDATE public.students SET price_tier = 'reimbursable' WHERE is_reimbursable;

ALTER TABLE public.students DROP COLUMN is_reimbursable;

-- student_invoices: same conversion
ALTER TABLE public.student_invoices
  ADD COLUMN price_tier text NOT NULL DEFAULT 'standard'
    CHECK (price_tier IN ('standard', 'reimbursable', 'private'));

UPDATE public.student_invoices SET price_tier = 'reimbursable' WHERE is_reimbursable;

ALTER TABLE public.student_invoices DROP COLUMN is_reimbursable;

-- invoice_lines: widen the snapshot CHECK. Existing 'standard'/'reimbursable'
-- rows stay valid, so issued invoices keep their recorded amounts and variants.
ALTER TABLE public.invoice_lines
  DROP CONSTRAINT IF EXISTS invoice_lines_variant_check;

ALTER TABLE public.invoice_lines
  ADD CONSTRAINT invoice_lines_variant_check
    CHECK (variant IN ('standard', 'reimbursable', 'private'));

-- Add receipt_type_id to student_invoices (one invoice = one receipt type)
ALTER TABLE public.student_invoices
  ADD COLUMN receipt_type_id uuid REFERENCES public.receipt_types(id);

-- Backfill existing invoices to the default receipt type (code '01')
UPDATE public.student_invoices
SET receipt_type_id = (
  SELECT id FROM public.receipt_types WHERE code = '01' LIMIT 1
)
WHERE receipt_type_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_invoices_receipt_type_id
  ON public.student_invoices (receipt_type_id);

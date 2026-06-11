-- Every invoice now derives its display name from its receipt type.
-- Enforce that the link is always present, then drop the redundant column.
ALTER TABLE public.student_invoices
  ALTER COLUMN receipt_type_id SET NOT NULL;

ALTER TABLE public.student_invoices
  DROP COLUMN invoice_name;

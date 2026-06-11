-- Rename the "receipt type" concept to "invoice type" across the schema.
-- All operations are metadata renames (non-destructive).

ALTER TABLE public.receipt_types RENAME TO invoice_types;

ALTER TABLE public.student_invoices RENAME COLUMN receipt_type_id TO invoice_type_id;
ALTER TABLE public.fee_items        RENAME COLUMN receipt_type_id TO invoice_type_id;
ALTER TABLE public.fee_rates        RENAME COLUMN receipt_type_id TO invoice_type_id;
ALTER TABLE public.receipts         RENAME COLUMN receipt_type_id TO invoice_type_id;

ALTER INDEX IF EXISTS idx_fee_items_receipt_type_id
  RENAME TO idx_fee_items_invoice_type_id;
ALTER INDEX IF EXISTS idx_student_invoices_receipt_type_id
  RENAME TO idx_student_invoices_invoice_type_id;

ALTER TABLE public.invoice_types
  RENAME CONSTRAINT receipt_types_code_unique TO invoice_types_code_unique;

ALTER TRIGGER receipt_types_set_updated_at ON public.invoice_types
  RENAME TO invoice_types_set_updated_at;

ALTER POLICY receipt_types_select ON public.invoice_types
  RENAME TO invoice_types_select;
ALTER POLICY receipt_types_admin_write ON public.invoice_types
  RENAME TO invoice_types_admin_write;

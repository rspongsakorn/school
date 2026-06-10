-- Add receipt_type_id to fee_items (each fee item belongs to exactly one receipt type)
ALTER TABLE public.fee_items
  ADD COLUMN receipt_type_id uuid REFERENCES public.receipt_types(id);

-- Backfill existing rows to the default receipt type (code '01')
UPDATE public.fee_items
SET receipt_type_id = (
  SELECT id FROM public.receipt_types WHERE code = '01' LIMIT 1
)
WHERE receipt_type_id IS NULL;

-- Enforce NOT NULL now that all rows are backfilled
ALTER TABLE public.fee_items
  ALTER COLUMN receipt_type_id SET NOT NULL;

-- Index for per-type listing/filtering
CREATE INDEX IF NOT EXISTS idx_fee_items_receipt_type_id
  ON public.fee_items (receipt_type_id);

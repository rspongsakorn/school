ALTER TABLE public.fee_items
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

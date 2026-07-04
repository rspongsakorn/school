-- students: persistent default for the reimbursable ("เบิกได้") price variant.
-- Used to pre-select students when generating invoices; existing rows default to
-- non-reimbursable, matching prior behavior.
ALTER TABLE public.students
  ADD COLUMN is_reimbursable boolean NOT NULL DEFAULT false;

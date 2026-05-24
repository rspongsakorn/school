-- Allow more than two semesters per academic year; create year with one initial semester.

ALTER TABLE public.semesters DROP CONSTRAINT IF EXISTS semesters_number_check;

ALTER TABLE public.semesters
  ADD CONSTRAINT semesters_number_positive_check CHECK (number >= 1);

DROP FUNCTION IF EXISTS public.create_academic_year_with_semesters(
  text, date, date, boolean, date, date, text, date, date, text
);

CREATE OR REPLACE FUNCTION public.create_academic_year_with_semesters(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_is_active boolean,
  p_sem1_start date,
  p_sem1_end date,
  p_sem1_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_year_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_is_active THEN
    UPDATE public.academic_years SET is_active = false WHERE is_active = true;
  END IF;

  INSERT INTO public.academic_years (name, start_date, end_date, is_active)
  VALUES (trim(p_name), p_start_date, p_end_date, p_is_active)
  RETURNING id INTO v_year_id;

  INSERT INTO public.semesters (academic_year_id, number, name, start_date, end_date)
  VALUES (v_year_id, 1, nullif(trim(p_sem1_name), ''), p_sem1_start, p_sem1_end);

  RETURN v_year_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_academic_year_with_semesters(
  text, date, date, boolean, date, date, text
) TO authenticated;

-- Enforce single active academic year and atomic year+semester writes.

CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_active_idx
  ON public.academic_years (is_active)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.create_academic_year_with_semesters(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_is_active boolean,
  p_sem1_start date,
  p_sem1_end date,
  p_sem1_name text,
  p_sem2_start date,
  p_sem2_end date,
  p_sem2_name text
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
  VALUES
    (v_year_id, 1, nullif(trim(p_sem1_name), ''), p_sem1_start, p_sem1_end),
    (v_year_id, 2, nullif(trim(p_sem2_name), ''), p_sem2_start, p_sem2_end);

  RETURN v_year_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_academic_year_with_semesters(
  p_year_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_is_active boolean,
  p_sem1_start date,
  p_sem1_end date,
  p_sem1_name text,
  p_sem2_start date,
  p_sem2_end date,
  p_sem2_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_is_active THEN
    UPDATE public.academic_years
    SET is_active = false
    WHERE is_active = true AND id <> p_year_id;
  END IF;

  UPDATE public.academic_years
  SET
    name = trim(p_name),
    start_date = p_start_date,
    end_date = p_end_date,
    is_active = p_is_active
  WHERE id = p_year_id;

  UPDATE public.semesters
  SET
    name = nullif(trim(p_sem1_name), ''),
    start_date = p_sem1_start,
    end_date = p_sem1_end
  WHERE academic_year_id = p_year_id AND number = 1;

  UPDATE public.semesters
  SET
    name = nullif(trim(p_sem2_name), ''),
    start_date = p_sem2_start,
    end_date = p_sem2_end
  WHERE academic_year_id = p_year_id AND number = 2;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_academic_year_with_semesters(
  text, date, date, boolean, date, date, text, date, date, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_academic_year_with_semesters(
  uuid, text, date, date, boolean, date, date, text, date, date, text
) TO authenticated;

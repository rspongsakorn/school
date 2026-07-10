CREATE TYPE public.student_gender AS ENUM ('male', 'female');

ALTER TABLE public.students
  ADD COLUMN gender public.student_gender,
  ADD COLUMN date_of_birth date;

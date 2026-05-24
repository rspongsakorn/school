-- Scope grade levels, classrooms, enrollments, and teacher assignments by semester.

ALTER TABLE public.grade_levels
  ADD COLUMN semester_id uuid REFERENCES public.semesters (id);

ALTER TABLE public.classrooms
  ADD COLUMN semester_id uuid REFERENCES public.semesters (id);

ALTER TABLE public.student_enrollments
  ADD COLUMN semester_id uuid REFERENCES public.semesters (id);

ALTER TABLE public.teacher_assignments
  ADD COLUMN semester_id uuid REFERENCES public.semesters (id);

UPDATE public.grade_levels gl
SET semester_id = s.id
FROM public.semesters s
WHERE s.academic_year_id = gl.academic_year_id
  AND s.number = 1;

UPDATE public.classrooms c
SET semester_id = s.id
FROM public.semesters s
WHERE s.academic_year_id = c.academic_year_id
  AND s.number = 1;

UPDATE public.student_enrollments se
SET semester_id = c.semester_id
FROM public.classrooms c
WHERE c.id = se.classroom_id;

UPDATE public.teacher_assignments ta
SET semester_id = c.semester_id
FROM public.classrooms c
WHERE c.id = ta.classroom_id;

ALTER TABLE public.grade_levels
  ALTER COLUMN semester_id SET NOT NULL;

ALTER TABLE public.classrooms
  ALTER COLUMN semester_id SET NOT NULL;

ALTER TABLE public.student_enrollments
  ALTER COLUMN semester_id SET NOT NULL;

ALTER TABLE public.teacher_assignments
  ALTER COLUMN semester_id SET NOT NULL;

ALTER TABLE public.grade_levels
  DROP CONSTRAINT IF EXISTS grade_levels_year_name_unique;

ALTER TABLE public.grade_levels
  ADD CONSTRAINT grade_levels_semester_name_unique UNIQUE (semester_id, name);

ALTER TABLE public.classrooms
  DROP CONSTRAINT IF EXISTS classrooms_year_grade_name_unique;

ALTER TABLE public.classrooms
  ADD CONSTRAINT classrooms_semester_grade_name_unique UNIQUE (semester_id, grade_level_id, name);

ALTER TABLE public.student_enrollments
  DROP CONSTRAINT IF EXISTS student_enrollments_student_year_unique;

ALTER TABLE public.student_enrollments
  ADD CONSTRAINT student_enrollments_student_semester_unique UNIQUE (student_id, semester_id);

ALTER TABLE public.teacher_assignments
  DROP CONSTRAINT IF EXISTS teacher_assignments_profile_classroom_year_unique;

ALTER TABLE public.teacher_assignments
  ADD CONSTRAINT teacher_assignments_profile_classroom_semester_unique UNIQUE (
    profile_id,
    classroom_id,
    semester_id
  );

CREATE INDEX IF NOT EXISTS idx_grade_levels_semester_id ON public.grade_levels (semester_id);

CREATE INDEX IF NOT EXISTS idx_classrooms_semester_id ON public.classrooms (semester_id);

CREATE INDEX IF NOT EXISTS idx_student_enrollments_semester_id ON public.student_enrollments (semester_id);

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_semester_id ON public.teacher_assignments (semester_id);

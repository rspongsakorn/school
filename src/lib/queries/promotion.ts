import { createClient } from "@/lib/supabase/client";
import type { SemesterOption } from "@/lib/context/semester-params";

/** ภาคเรียนทั้งหมดในทุกปี (ไว้ทำ dropdown ต้นทาง/ปลายทาง) พร้อมชื่อปี */
export type SemesterChoice = SemesterOption & { academic_year_name: string };

export async function fetchAllSemesters(): Promise<SemesterChoice[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("semesters")
    .select("id, academic_year_id, number, name, academic_years ( name, start_date )")
    .order("start_date", { ascending: false, foreignTable: "academic_years" })
    .order("number", { ascending: true });

  if (error || !data) return [];

  type Row = {
    id: string;
    academic_year_id: string;
    number: number;
    name: string | null;
    academic_years: { name: string; start_date: string } | null;
  };

  return (data as unknown as Row[]).map((row) => ({
    id: row.id,
    academic_year_id: row.academic_year_id,
    number: row.number,
    name: row.name,
    academic_year_name: row.academic_years?.name ?? "—",
  }));
}

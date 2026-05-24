-- Seed data (design spec §3.1 receipt_types)
-- Runs on `supabase db reset` when [db.seed] is enabled in config.toml

INSERT INTO public.receipt_types (code, name, description, is_active)
VALUES (
  '01',
  'ค่าธรรมเนียมการศึกษา',
  'ประเภทใบเสร็จเริ่มต้น',
  true
)
ON CONFLICT (code) DO NOTHING;

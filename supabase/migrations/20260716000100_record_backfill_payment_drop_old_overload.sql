-- record_backfill_payment accumulated two overloads over time: the original
-- 10-arg version (before discounts existed) and each later CREATE OR REPLACE
-- that changed the parameter list created a NEW overload alongside it rather
-- than replacing it, since Postgres only replaces on an exact signature
-- match. All current callers pass either 10 args (CSV backfill, no
-- discounts) or 11 args (XLSX backfill, with p_discounts) so both already
-- resolve correctly by exact match — but two overloads for one RPC is
-- confusing to reason about. Drop the bare 10-arg original now that the
-- 11-arg version's p_discounts has a DEFAULT and covers the 10-arg call shape.

DROP FUNCTION IF EXISTS public.record_backfill_payment(
  uuid, uuid, text, numeric, timestamptz, uuid, text, uuid, jsonb, jsonb
);

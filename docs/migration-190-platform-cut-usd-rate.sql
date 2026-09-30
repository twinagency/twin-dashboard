-- Proposed twin-bot migration 190 (next free number; latest on origin/main is 189).
-- Copy to twin-bot/db/migrations/190_platform_cut_usd_rate.sql, then apply to
-- aouaenqayfltoqrmpitg ONLY, BEFORE deploying this dashboard branch (the
-- dashboard selects this column; without it non-admin views fail closed).
--
-- Per-account star -> USD rate. Null means the default 0.013.
alter table platform_cuts
  add column if not exists usd_per_star numeric(6,4) null
  check (usd_per_star between 0.001 and 0.09);

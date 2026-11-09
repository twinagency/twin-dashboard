-- Bank details a creator adds so she can be paid. One row per creator (clone).
-- Service-role only: no browser or Data API access. Nothing is seeded.
create table if not exists public.creator_bank_details (
  clone_id uuid primary key references public.clones(id) on delete restrict,
  country text not null check (length(country) between 2 and 80),
  swift_bic text not null default '' check (length(swift_bic) <= 11),
  branch_number text not null default '' check (length(branch_number) <= 20),
  account_number text not null check (length(account_number) between 4 and 34),
  account_name text not null check (length(account_name) between 2 and 140),
  updated_by text not null check (length(updated_by) between 1 and 200),
  updated_at timestamptz not null default now(),
  check (swift_bic <> '' or branch_number <> '')
);
alter table public.creator_bank_details enable row level security;
revoke all on public.creator_bank_details from public, anon, authenticated;
grant select, insert, update on public.creator_bank_details to service_role;
notify pgrst, 'reload schema';

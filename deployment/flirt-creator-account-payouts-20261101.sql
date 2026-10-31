-- FLIRT ONLY: allow audited payout history for externally linked creator accounts.
-- These accounts link to their Twin Telegram identity by twin_slug, without a
-- local FLIRT clone. Never provision a duplicate messaging clone for payouts.
alter table public.telegram_creator_payouts
  add column if not exists creator_account_id uuid references public.creator_accounts(id) on delete restrict;
alter table public.telegram_creator_payouts
  add column if not exists original_aud_cents bigint check (original_aud_cents is null or original_aud_cents > 0);
alter table public.telegram_creator_payouts alter column clone_id drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='telegram_payout_exactly_one_creator') then
    alter table public.telegram_creator_payouts add constraint telegram_payout_exactly_one_creator
      check ((clone_id is not null and creator_account_id is null)
          or (clone_id is null and creator_account_id is not null));
  end if;
end $$;
create index if not exists telegram_creator_payouts_account_history_idx
  on public.telegram_creator_payouts(creator_account_id, paid_on desc, created_at desc, id desc)
  where creator_account_id is not null;

create table if not exists public.creator_payout_earnings_snapshots (
 creator_account_id uuid primary key references public.creator_accounts(id) on delete restrict,
 gross_usd_cents bigint not null check (gross_usd_cents >= 0),
 agency_cut_bps integer not null check (agency_cut_bps between 0 and 10000),
 platform_balance_usd_cents bigint check (platform_balance_usd_cents is null or platform_balance_usd_cents >= 0),
 available_balance_usd_cents bigint check (available_balance_usd_cents is null or available_balance_usd_cents >= 0),
 as_of_date date not null,
 provenance text not null,
 updated_at timestamptz not null default now()
);
alter table public.creator_payout_earnings_snapshots enable row level security;
revoke all on public.creator_payout_earnings_snapshots from public,anon,authenticated;
grant select,insert,update on public.creator_payout_earnings_snapshots to service_role;
notify pgrst,'reload schema';

-- Empty manual payout ledger. No payment, date or creator data is seeded.
create table if not exists public.telegram_creator_payouts (
  id uuid primary key default gen_random_uuid(),
  clone_id uuid not null references public.clones(id) on delete restrict,
  request_id uuid not null unique,
  amount_cents bigint not null check (amount_cents between 1 and 99999999999),
  currency text not null check (currency in ('USD', 'AUD')),
  paid_on date not null check (paid_on >= date '2000-01-01'),
  reference varchar(240) not null default '',
  payment_method varchar(80) not null default '',
  recorded_by text not null check (length(recorded_by) between 1 and 200),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by text,
  void_reason varchar(240),
  check ((voided_at is null and voided_by is null and void_reason is null) or
         (voided_at is not null and length(voided_by) between 1 and 200 and length(trim(void_reason)) between 1 and 240))
);
create index if not exists telegram_creator_payouts_clone_history_idx
  on public.telegram_creator_payouts (clone_id, paid_on desc, created_at desc, id desc);
alter table public.telegram_creator_payouts enable row level security;
revoke all on public.telegram_creator_payouts from public, anon, authenticated;
grant select, insert on public.telegram_creator_payouts to service_role;
grant update (voided_at, voided_by, void_reason) on public.telegram_creator_payouts to service_role;

-- All reads/writes go through the independently authenticated dashboard API.
-- No browser credentials or direct Data API policy exposes the ledger.
create or replace function public.telegram_payout_earnings(p_clone_ids uuid[])
returns table (clone_id uuid, stars numeric)
language sql stable security invoker set search_path = public
as $$
  select c.id, coalesce(sum(t.amount_stars), 0)::numeric
  from public.clones c
  left join public.star_transactions t on t.clone_id = c.id
  where c.id = any(p_clone_ids)
  group by c.id;
$$;
create or replace function public.telegram_payout_summary(p_clone_ids uuid[])
returns table (clone_id uuid, currency text, paid_cents bigint, last_paid_on date)
language sql stable security invoker set search_path = public
as $$
  select p.clone_id, p.currency, sum(p.amount_cents)::bigint, max(p.paid_on)
  from public.telegram_creator_payouts p
  where p.clone_id = any(p_clone_ids) and p.voided_at is null
  group by p.clone_id, p.currency;
$$;
revoke all on function public.telegram_payout_earnings(uuid[]) from public, anon, authenticated;
revoke all on function public.telegram_payout_summary(uuid[]) from public, anon, authenticated;
grant execute on function public.telegram_payout_earnings(uuid[]) to service_role;
grant execute on function public.telegram_payout_summary(uuid[]) to service_role;

create or replace function public.telegram_payout_preserve_record()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if tg_op = 'DELETE' then raise exception 'Payout history cannot be deleted'; end if;
  if old.voided_at is not null or
     (to_jsonb(new) - array['voided_at','voided_by','void_reason']) is distinct from
     (to_jsonb(old) - array['voided_at','voided_by','void_reason']) or
     new.voided_at is null then
    raise exception 'Payout records are immutable. Void an incorrect entry and record a correction.';
  end if;
  return new;
end;
$$;
revoke all on function public.telegram_payout_preserve_record() from public, anon, authenticated;
drop trigger if exists telegram_payout_immutable on public.telegram_creator_payouts;
create trigger telegram_payout_immutable before update or delete on public.telegram_creator_payouts
for each row execute function public.telegram_payout_preserve_record();
notify pgrst, 'reload schema';

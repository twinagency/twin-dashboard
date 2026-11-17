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
  with transactions as (
    select t.clone_id, t.telegram_id, t.kind, t.amount_stars, t.paid_at,
      -- PostgreSQL's default btrim removes only spaces. Match JavaScript trim().
      (t.amount_stars < 0 or lower(btrim(coalesce(t.invoice_payload, ''),
        U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
      )) = 'refund') as is_adjustment
    from public.star_transactions t
    where t.clone_id = any(p_clone_ids)
  ), kept as (
    -- Keep each adjustment, including same-amount refunds at the same time.
    select t.clone_id, t.amount_stars
    from transactions t
    where t.is_adjustment
    union all
    select d.clone_id, d.amount_stars
    from (
      select distinct t.clone_id, t.telegram_id, t.kind, t.amount_stars, t.paid_at
      from transactions t
      where not t.is_adjustment
    ) d
  )
  select c.id, coalesce(sum(k.amount_stars), 0)::numeric as stars
  from public.clones c
  left join kept k on k.clone_id = c.id
  where c.id = any(p_clone_ids)
  group by c.id;
$$;

-- The creator and agency header totals use the same Star accounting as Payouts.
create or replace function public.revenue_all_time_stars(p_clone uuid default null)
returns bigint
language sql stable security invoker set search_path = public
as $$
  select coalesce(sum(e.stars), 0)::bigint
  from public.telegram_payout_earnings(case
    when p_clone is null then array(select c.id from public.clones c)
    else array[p_clone]
  end) e;
$$;

create or replace function public.agency_revenue_all_time_stars(p_clones uuid[], p_clone uuid default null)
returns bigint
language sql stable security invoker set search_path = public
as $$
  select coalesce(sum(e.stars), 0)::bigint
  from public.telegram_payout_earnings(case
    when p_clone is null then p_clones
    when p_clone = any(p_clones) then array[p_clone]
    else array[]::uuid[]
  end) e;
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
revoke all on function public.revenue_all_time_stars(uuid) from public, anon, authenticated;
grant execute on function public.revenue_all_time_stars(uuid) to service_role;
revoke all on function public.agency_revenue_all_time_stars(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.agency_revenue_all_time_stars(uuid[], uuid) to service_role;
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

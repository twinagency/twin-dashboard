-- One welcome allocation per fan/creator programme. This is starting credit,
-- not a payment, a daily grant, or a credit on each catalogue visit.
-- Existing purchase earnings, refunds, and redeemed points are preserved.
alter table public.catalogue_loyalty_programs
  add column if not exists welcome_bonus_points integer not null default 400
  check (welcome_bonus_points >= 0);

create or replace function public.catalogue_reward_balance(p_clone uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare cfg public.catalogue_loyalty_programs; fan public.users; earned bigint; used bigint;
begin
 select * into cfg from public.catalogue_loyalty_programs where clone_id=p_clone and enabled;
 select * into fan from public.users where id=p_user and clone_id=p_clone;
 if cfg.clone_id is null or fan.id is null then return null; end if;
 -- Keep the canonical charge/refund accounting unchanged. Bonus credit does
 -- not enter the revenue ledger or count as Stars paid by the fan.
 select coalesce(sum(t.amount_stars + coalesce(r.amount_stars,0)),0) into earned
 from public.star_transactions t left join public.star_transactions r
 on r.id='refund:'||t.id and r.clone_id=t.clone_id and r.amount_stars<0
 where t.clone_id=p_clone and t.telegram_id=fan.telegram_id and t.amount_stars>0
 and t.paid_at>=cfg.starts_at and t.kind in ('media','credits','tip','subscription','other');
 select coalesce(sum(c.points),0) into used from public.catalogue_reward_claims c
 join public.catalogue_requests q on q.id=c.request_id
 where c.clone_id=p_clone and c.user_id=p_user and q.status not in ('failed','expired');
 return jsonb_build_object('earned',earned,'spent',used,
   'welcomeBonus',cfg.welcome_bonus_points,
   'balance',earned+cfg.welcome_bonus_points-used,
   'cost',cfg.points_cost,'startsAt',cfg.starts_at);
end $function$;

-- The authenticated catalogue backend is the only client of this RPC.
revoke all on function public.catalogue_reward_balance(uuid,uuid) from public,anon,authenticated;
grant execute on function public.catalogue_reward_balance(uuid,uuid) to service_role;

-- Integration check: all fixture rows and queued claims are rolled back.
-- No real payment is taken and no request becomes visible to the sender.
begin;
do $test$
declare
 cfg public.catalogue_loyalty_programs;
 fan_id uuid := gen_random_uuid();
 request_id uuid := gen_random_uuid();
 fan_telegram bigint := 9000000000000000 + floor(random()*1000000)::bigint;
 charge_id text := 'catalogue-welcome-check:'||gen_random_uuid()::text;
 balance jsonb;
 claim jsonb;
 rejected boolean := false;
begin
 select p.* into strict cfg from public.catalogue_loyalty_programs p
 join public.clones c on c.id=p.clone_id where c.slug='briana-redd' and p.enabled;
 assert cfg.welcome_bonus_points=400 and cfg.points_cost=2500, 'Expected 400 welcome / 2500 goal';
 insert into public.users(id,clone_id,telegram_id,business_connection_id,last_message_received,is_test)
 values(fan_id,cfg.clone_id,fan_telegram,'catalogue-welcome-rollback-test',now(),true);
 balance:=public.catalogue_reward_balance(cfg.clone_id,fan_id);
 assert (balance->>'balance')::int=400 and (balance->>'earned')::int=0, 'New fan receives only welcome credit';
 assert public.catalogue_reward_balance(cfg.clone_id,fan_id)=balance, 'Reading twice must not grant twice';
 assert public.catalogue_reward_balance(gen_random_uuid(),fan_id) is null, 'Creator isolation';
 insert into public.star_transactions(id,clone_id,user_id,telegram_id,kind,amount_stars,paid_at,imported_from)
 select charge_id||':'||kind,cfg.clone_id,fan_id,fan_telegram,kind,amount,now(),'rollback-test'
 from (values('media',1000),('credits',500),('tip',300),('subscription',200),('other',99)) as payments(kind,amount);
 balance:=public.catalogue_reward_balance(cfg.clone_id,fan_id);
 assert (balance->>'balance')::int=2499 and (balance->>'earned')::int=2099, 'Every supported payment kind earns points';
 begin
  perform public.catalogue_claim_reward(cfg.clone_id,fan_id,cfg.reward_photo_ids[1],request_id);
 exception when others then
  if sqlerrm='Not enough points' then rejected:=true; else raise; end if;
 end;
 assert rejected, '2499 must not unlock a reward';
 insert into public.star_transactions(id,clone_id,user_id,telegram_id,kind,amount_stars,paid_at,imported_from)
 values(charge_id||':last',cfg.clone_id,fan_id,fan_telegram,'tip',1,now(),'rollback-test');
 claim:=public.catalogue_claim_reward(cfg.clone_id,fan_id,cfg.reward_photo_ids[1],request_id);
 assert claim->>'status'='pending', 'Welcome credit must count toward actual redemption';
 assert (public.catalogue_reward_balance(cfg.clone_id,fan_id)->>'balance')::int=0, 'Claim deducts 2500 once';
 assert public.catalogue_claim_reward(cfg.clone_id,fan_id,cfg.reward_photo_ids[1],request_id)=claim, 'Claim retry is idempotent';
 assert (public.catalogue_reward_balance(cfg.clone_id,fan_id)->>'balance')::int=0, 'Reopening after a claim must not restore the welcome credit';
 update public.catalogue_requests set status='failed' where id=request_id;
 assert (public.catalogue_reward_balance(cfg.clone_id,fan_id)->>'balance')::int=2500, 'Failed delivery restores points';
 insert into public.star_transactions(id,clone_id,telegram_id,kind,amount_stars,paid_at,imported_from)
 values('refund:'||charge_id||':last',cfg.clone_id,fan_telegram,'tip',-1,now(),'rollback-test');
 assert (public.catalogue_reward_balance(cfg.clone_id,fan_id)->>'balance')::int=2499, 'Refund reverses earned points';
 assert not has_function_privilege('anon','public.catalogue_reward_balance(uuid,uuid)','EXECUTE'), 'No anonymous access';
 assert not has_function_privilege('authenticated','public.catalogue_reward_balance(uuid,uuid)','EXECUTE'), 'No direct client access';
end $test$;
rollback;
select 'Welcome bonus, payment kinds, 2499/2500 threshold, retry, failed delivery, refunds and access checks passed; fixtures rolled back.' as result;

-- Extend the existing account, identity and agency owners; no second creator store.
alter table public.creator_accounts add column if not exists platform_creator_id uuid references public.clones(id);
alter table public.creator_accounts add column if not exists requested_channels text[] not null default '{}';
create unique index if not exists creator_accounts_platform_creator_unique on public.creator_accounts(platform_creator_id) where platform_creator_id is not null;

create or replace function public.setup_creator_platforms(p_account_id uuid, p_user_id uuid, p_channels text[])
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  account public.creator_accounts%rowtype;
  linked uuid;
  profile uuid;
  agency uuid;
begin
  if p_channels is null or cardinality(p_channels) not between 1 and 2
    or exists (select 1 from unnest(p_channels) c where c is null or c not in ('telegram','onlyfans'))
    or cardinality(p_channels) <> (select count(distinct c) from unnest(p_channels) c)
    then raise exception 'platform_choice_invalid'; end if;
  select * into account from public.creator_accounts where id=p_account_id for update;
  if not found or account.auth_user_id is distinct from p_user_id
    or account.account_status not in ('applicant','approved','active') then raise exception 'creator_unavailable'; end if;
  select a.agency_id into agency from public.creator_agency_assignments a where a.creator_account_id=account.id;
  if (account.source='agency_invite' and agency is null) or (agency is not null and not exists
    (select 1 from public.partner_agencies a where a.id=agency and a.active)) then raise exception 'creator_unavailable'; end if;
  select l.clone_id into linked from public.creator_clone_links l where l.creator_account_id=account.id;
  if account.platform_creator_id is not null and linked is not null and account.platform_creator_id<>linked
    then raise exception 'platform_identity_conflict'; end if;
  profile := coalesce(account.platform_creator_id, linked);
  if profile is null then
    -- This is a paused channel-neutral profile. It is NOT a Telegram connection.
    -- Do not create creator_clone_links: existing intake/content remain intact.
    profile := account.id;
    if exists(select 1 from public.clones where id=profile) then raise exception 'platform_identity_conflict'; end if;
    insert into public.clones(id,slug,name,bot_token,status,voice_enabled,charge_messages,drip_enabled,uses_default_config)
      values(profile,'creator-'||account.id::text,account.display_name,'','paused',false,false,false,false);
  end if;
  if not exists(select 1 from public.clones where id=profile) then raise exception 'platform_identity_unavailable'; end if;
  update public.creator_accounts set platform_creator_id=profile,requested_channels=p_channels,updated_at=now() where id=account.id;
  if agency is not null then
    insert into public.agency_creators(agency_id,clone_id) values(agency,profile) on conflict do nothing;
  end if;
  return profile;
end;
$$;
revoke all on function public.setup_creator_platforms(uuid,uuid,text[]) from public, anon, authenticated;
grant execute on function public.setup_creator_platforms(uuid,uuid,text[]) to service_role;

-- Keep every existing linking interface on the same canonical identity once set.
create or replace function public.enforce_creator_platform_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare expected uuid;
begin
  select platform_creator_id into expected from public.creator_accounts where id=new.creator_account_id for update;
  if expected is not null and expected<>new.clone_id then raise exception 'Use the existing platform creator profile'; end if;
  return new;
end;
$$;
revoke all on function public.enforce_creator_platform_identity() from public, anon, authenticated;
drop trigger if exists creator_platform_identity on public.creator_clone_links;
create trigger creator_platform_identity before insert or update of clone_id,creator_account_id on public.creator_clone_links
  for each row execute function public.enforce_creator_platform_identity();

-- Existing admin/agency linking interfaces share one atomic relink operation.
create or replace function public.link_creator_platform_profile(p_account_id uuid,p_clone_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare account public.creator_accounts%rowtype; profile public.clones%rowtype; previous uuid; reserved uuid;
begin
  select * into account from public.creator_accounts where id=p_account_id for update;
  if not found then raise exception 'Creator account not found'; end if;
  if p_clone_id is null then delete from public.creator_clone_links where creator_account_id=p_account_id;return;end if;
  if account.platform_creator_id is not null and account.platform_creator_id<>p_clone_id then
    raise exception 'Use the existing platform creator profile';end if;
  select * into profile from public.clones where id=p_clone_id for update;
  if not found then raise exception 'Creator profile not found';end if;
  for previous in select creator_account_id from public.creator_clone_links where clone_id=p_clone_id and creator_account_id<>p_account_id loop
    select platform_creator_id into reserved from public.creator_accounts where id=previous for update;
    if reserved is not null then raise exception 'This profile is attached to another creator account';end if;
  end loop;
  if exists(select 1 from public.creator_accounts where platform_creator_id=p_clone_id and id<>p_account_id) then
    raise exception 'This profile is attached to another creator account';end if;
  delete from public.creator_clone_links where clone_id=p_clone_id and creator_account_id<>p_account_id;
  insert into public.creator_clone_links(creator_account_id,clone_id,twin_slug,linked_at)
    values(p_account_id,p_clone_id,profile.slug,now()) on conflict(creator_account_id)do update
    set clone_id=excluded.clone_id,twin_slug=excluded.twin_slug,linked_at=excluded.linked_at;
end;
$$;
revoke all on function public.link_creator_platform_profile(uuid,uuid) from public,anon,authenticated;
grant execute on function public.link_creator_platform_profile(uuid,uuid) to service_role;

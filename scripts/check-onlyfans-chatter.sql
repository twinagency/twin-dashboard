-- Disposable PostgreSQL contract; all fixtures and DDL roll back.
-- Never targets production tables. Requires roles anon/authenticated/service_role.
begin;
create schema of_launch_chatter_contract;
set local search_path=of_launch_chatter_contract,pg_temp;
create table partner_agencies(id uuid primary key,active boolean not null);
create table agency_creators(agency_id uuid,clone_id uuid);
create table agency_memberships(user_id uuid primary key,agency_id uuid,email text,active boolean default true,can_manage boolean default false,creator_scope text default 'selected',creator_ids uuid[] default '{}',creator_access_revision uuid default gen_random_uuid());
create table agency_team_owners(user_id uuid primary key,agency_id uuid);
create table agency_team_invites(id uuid primary key default gen_random_uuid(),agency_id uuid,invited_by uuid,email text,token_hash text unique,can_manage boolean default false,creator_scope text default 'selected',creator_ids uuid[] default '{}',created_at timestamptz default now(),expires_at timestamptz default now()+interval '7 days',revoked_at timestamptz,accepted_at timestamptz,accepted_by uuid);
insert into partner_agencies values('11111111-1111-4111-8111-111111111111',true),('22222222-2222-4222-8222-222222222222',true);
insert into agency_creators values('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333');
insert into agency_memberships(user_id,agency_id,email,can_manage,creator_scope,creator_access_revision) values
('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','owner@example.invalid',true,'all','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','staff@example.invalid',false,'selected','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into agency_team_owners values('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111');
-- Additive capability. Existing staff and invitations keep their present access.
-- Apply before deploying the dashboard that selects can_chat. No grants are enabled here.

alter table of_launch_chatter_contract.agency_memberships add column can_chat boolean not null default false;
alter table of_launch_chatter_contract.agency_team_invites add column can_chat boolean not null default false;
create or replace function of_launch_chatter_contract.agency_team_command(p_actor uuid,p_agency uuid,p_command jsonb)
returns uuid language plpgsql security invoker set search_path = of_launch_chatter_contract,pg_temp as $$
declare op text := p_command->>'operation'; target uuid; result_id uuid; ids uuid[]; mode text;
begin
  perform 1 from partner_agencies where id=p_agency and active for update;
  if not found then raise exception 'Agency unavailable'; end if;
  perform 1 from agency_memberships m join agency_team_owners o on o.user_id=m.user_id and o.agency_id=m.agency_id
    where m.user_id=p_actor and m.agency_id=p_agency and m.active and m.creator_scope='all' for update of m,o;
  if not found then raise exception 'Owner access required'; end if;
  if op in ('invite','update') then
    mode := p_command->>'creator_scope';
    select coalesce(array_agg(distinct value::uuid),'{}') into ids from jsonb_array_elements_text(p_command->'creator_ids');
    if mode is null or mode not in ('all','selected') or cardinality(ids)>1000 or (mode='all' and cardinality(ids)>0)
      or exists(select 1 from unnest(ids) i where not exists(select 1 from agency_creators a where a.agency_id=p_agency and a.clone_id=i)) then
      raise exception 'Invalid creator scope';
    end if;
  end if;
  if op='invite' then
    if exists(select 1 from agency_memberships where agency_id=p_agency and lower(email)=lower(p_command->>'email')) then raise exception 'Member already exists'; end if;
    update agency_team_invites set revoked_at=now() where agency_id=p_agency and email=p_command->>'email' and accepted_at is null and revoked_at is null;
    insert into agency_team_invites(agency_id,invited_by,email,token_hash,can_manage,can_chat,creator_scope,creator_ids)
      values(p_agency,p_actor,p_command->>'email',p_command->>'token_hash',(p_command->>'can_manage')::boolean,coalesce((p_command->>'can_chat')::boolean,false),mode,ids) returning id into result_id;
  elsif op='revoke-invite' then
    update agency_team_invites set revoked_at=now() where agency_id=p_agency and id=(p_command->>'id')::uuid and accepted_at is null and revoked_at is null returning id into result_id;
  elsif op in ('update','remove') then
    target := (p_command->>'user_id')::uuid;
    -- Agency owners cannot remove themselves, modify another owner, or create owners.
    if target=p_actor or exists(select 1 from agency_team_owners where user_id=target) then raise exception 'Owner changes require Twin admin'; end if;
    if op='remove' then
      update agency_memberships set active=false,creator_access_revision=gen_random_uuid()
        where user_id=target and agency_id=p_agency and creator_access_revision=(p_command->>'revision')::uuid returning user_id into result_id;
    else
      update agency_memberships set active=true,can_manage=(p_command->>'can_manage')::boolean,can_chat=coalesce((p_command->>'can_chat')::boolean,false),creator_scope=mode,creator_ids=ids,creator_access_revision=gen_random_uuid()
        where user_id=target and agency_id=p_agency and creator_access_revision=(p_command->>'revision')::uuid returning user_id into result_id;
    end if;
  else raise exception 'Invalid operation'; end if;
  if result_id is null then raise exception 'Record changed'; end if;
  return result_id;
end $$;

create or replace function of_launch_chatter_contract.agency_team_accept(p_user uuid,p_hash text,p_verified_email text)
returns uuid language plpgsql security invoker set search_path = of_launch_chatter_contract,pg_temp as $$
declare invitation agency_team_invites; verified_email text; agency uuid; valid_ids uuid[];
begin
  select agency_id into agency from agency_team_invites where token_hash=p_hash;
  perform 1 from partner_agencies where id=agency and active for update;
  if not found then raise exception 'Invitation unavailable'; end if;
  select * into invitation from agency_team_invites where token_hash=p_hash for update;
  if invitation.revoked_at is not null or invitation.accepted_at is not null or invitation.expires_at<=now() then raise exception 'Invitation unavailable'; end if;
  -- Verified using Auth.getUser by the server. Only service_role may call this RPC.
  verified_email := lower(p_verified_email);
  if verified_email is null or verified_email<>invitation.email then raise exception 'Verify the invited email'; end if;
  perform 1 from agency_memberships m join agency_team_owners o on o.user_id=m.user_id and o.agency_id=m.agency_id
    where m.user_id=invitation.invited_by and m.agency_id=agency and m.active and m.creator_scope='all' for update of m,o;
  if not found then raise exception 'Invitation owner unavailable'; end if;
  -- Never overwrite or reactivate an existing membership, including another agency.
  if exists(select 1 from agency_memberships where user_id=p_user) then raise exception 'Membership already exists'; end if;
  select coalesce(array_agg(i),'{}') into valid_ids from unnest(invitation.creator_ids) i
    where exists(select 1 from agency_creators a where a.agency_id=agency and a.clone_id=i);
  insert into agency_memberships(user_id,agency_id,email,active,can_manage,can_chat,creator_scope,creator_ids)
    values(p_user,agency,verified_email,true,invitation.can_manage,invitation.can_chat,invitation.creator_scope,valid_ids);
  update agency_team_invites set accepted_at=now(),accepted_by=p_user where id=invitation.id;
  return agency;
end $$;
revoke all on function of_launch_chatter_contract.agency_team_command(uuid,uuid,jsonb), of_launch_chatter_contract.agency_team_accept(uuid,text,text) from public,anon,authenticated;
grant execute on function of_launch_chatter_contract.agency_team_command(uuid,uuid,jsonb), of_launch_chatter_contract.agency_team_accept(uuid,text,text) to service_role;


do $$
declare owner_id uuid := '44444444-4444-4444-8444-444444444444'; agency_id uuid := '11111111-1111-4111-8111-111111111111'; target uuid := '55555555-5555-4555-8555-555555555555'; cmd jsonb;
begin
  if exists(select 1 from agency_memberships where can_chat) then raise exception 'Migration widened existing access'; end if;
  cmd := jsonb_build_object('operation','update','user_id',target,'revision','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','creator_scope','selected','creator_ids',jsonb_build_array('33333333-3333-4333-8333-333333333333'),'can_manage',false,'can_chat',true);
  perform agency_team_command(owner_id,agency_id,cmd);
  if not exists(select 1 from agency_memberships where user_id=target and can_chat and not can_manage and creator_scope='selected' and cardinality(creator_ids)=1) then raise exception 'Chatter capability/scoping failed'; end if;
  begin perform agency_team_command(owner_id,agency_id,cmd); raise exception 'Stale command was accepted'; exception when others then if sqlerrm='Stale command was accepted' then raise; end if; end;
  begin perform agency_team_command(target,agency_id,cmd); raise exception 'Non-owner changed permissions'; exception when others then if sqlerrm='Non-owner changed permissions' then raise; end if; end;
  begin perform agency_team_command(owner_id,'22222222-2222-4222-8222-222222222222',cmd); raise exception 'Cross-agency command accepted'; exception when others then if sqlerrm='Cross-agency command accepted' then raise; end if; end;
  perform agency_team_command(owner_id,agency_id,jsonb_build_object('operation','invite','email','new@example.invalid','token_hash',repeat('a',64),'can_manage',false,'can_chat',true,'creator_scope','selected','creator_ids',jsonb_build_array('33333333-3333-4333-8333-333333333333')));
  perform agency_team_accept('66666666-6666-4666-8666-666666666666',repeat('a',64),'new@example.invalid');
  if not exists(select 1 from agency_memberships where user_id='66666666-6666-4666-8666-666666666666' and can_chat and not can_manage) then raise exception 'Invite lost chatter capability'; end if;
  if has_function_privilege('anon','of_launch_chatter_contract.agency_team_command(uuid,uuid,jsonb)','execute') or has_function_privilege('authenticated','of_launch_chatter_contract.agency_team_command(uuid,uuid,jsonb)','execute') then raise exception 'Public permission administration'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='of_launch_chatter_contract' and p.prosecdef) then raise exception 'Unexpected definer escalation'; end if;
end $$;
select 'PASS: default-deny migration, scoped chatter, revision conflict, owner-only and cross-agency denial, invitation acceptance, private invoker RPCs' as result;
rollback;

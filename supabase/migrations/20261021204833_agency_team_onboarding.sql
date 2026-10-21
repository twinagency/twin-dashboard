-- Explicit delegation only: no existing member is automatically made an owner.
create table public.agency_team_owners (
  user_id uuid primary key references public.agency_memberships(user_id) on delete cascade,
  agency_id uuid not null references public.partner_agencies(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index agency_team_owners_agency on public.agency_team_owners(agency_id);
create table public.agency_team_invites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.partner_agencies(id) on delete cascade,
  invited_by uuid not null references auth.users(id),
  email text not null check (email = lower(trim(email)) and length(email) <= 254),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  can_manage boolean not null default false,
  creator_scope text not null default 'selected' check (creator_scope in ('all','selected')),
  creator_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  email_requested_at timestamptz,
  check (cardinality(creator_ids) <= 1000 and array_position(creator_ids,null) is null and (creator_scope='selected' or cardinality(creator_ids)=0))
);
create index agency_team_invites_agency on public.agency_team_invites(agency_id,created_at desc);
alter table public.agency_team_owners enable row level security;
alter table public.agency_team_invites enable row level security;
revoke all on public.agency_team_owners, public.agency_team_invites from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.agency_team_owners to service_role;
grant select,insert,update on public.agency_team_invites to service_role;

-- Called only by the server after Auth.getUser. Lock the agency and owner
-- membership to serialize invitation/member changes with owner revocation.
create function public.agency_team_command(p_actor uuid,p_agency uuid,p_command jsonb)
returns uuid language plpgsql security invoker set search_path = public,pg_temp as $$
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
    insert into agency_team_invites(agency_id,invited_by,email,token_hash,can_manage,creator_scope,creator_ids)
      values(p_agency,p_actor,p_command->>'email',p_command->>'token_hash',(p_command->>'can_manage')::boolean,mode,ids) returning id into result_id;
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
      update agency_memberships set active=true,can_manage=(p_command->>'can_manage')::boolean,creator_scope=mode,creator_ids=ids,creator_access_revision=gen_random_uuid()
        where user_id=target and agency_id=p_agency and creator_access_revision=(p_command->>'revision')::uuid returning user_id into result_id;
    end if;
  else raise exception 'Invalid operation'; end if;
  if result_id is null then raise exception 'Record changed'; end if;
  return result_id;
end $$;

create function public.agency_team_accept(p_user uuid,p_hash text,p_verified_email text)
returns uuid language plpgsql security invoker set search_path = public,pg_temp as $$
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
  insert into agency_memberships(user_id,agency_id,email,active,can_manage,creator_scope,creator_ids)
    values(p_user,agency,verified_email,true,invitation.can_manage,invitation.creator_scope,valid_ids);
  update agency_team_invites set accepted_at=now(),accepted_by=p_user where id=invitation.id;
  return agency;
end $$;
revoke all on function public.agency_team_command(uuid,uuid,jsonb), public.agency_team_accept(uuid,text,text) from public,anon,authenticated;
grant execute on function public.agency_team_command(uuid,uuid,jsonb), public.agency_team_accept(uuid,text,text) to service_role;

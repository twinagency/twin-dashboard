-- Additive, service-only registration transaction. Auth creation remains through
-- the supported Auth Admin API; this function never creates an auth user.
create or replace function public.provision_creator_registration(
  p_user_id uuid, p_email text, p_display_name text, p_code_hash text default null,
  p_direct_agency_id uuid default null, p_expected_agency_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid;
  existing public.creator_accounts%rowtype;
  invitation public.creator_agency_codes%rowtype;
  agency_id uuid;
begin
  if p_user_id is null or p_display_name is null or length(trim(p_display_name)) = 0
    or p_email <> lower(trim(p_email)) or not exists (
      select 1 from auth.users u where u.id = p_user_id and lower(u.email) = p_email
    ) then raise exception 'registration_identity_invalid'; end if;
  -- Serialize retry/concurrent provisioning of the same authenticated identity.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_email, 0));
  select * into existing from public.creator_accounts where auth_user_id = p_user_id for update;
  if found then
    -- A lost response can be retried without claiming the invitation twice.
    return existing.id;
  end if;
  if p_code_hash is not null then
    select * into invitation from public.creator_agency_codes where code_hash = p_code_hash for update;
    if not found then raise exception 'invite_invalid'; end if;
    if not invitation.active then raise exception 'invite_disabled'; end if;
    if invitation.expires_at <= now() then raise exception 'invite_expired'; end if;
    if invitation.max_uses is not null and invitation.uses >= invitation.max_uses then raise exception 'invite_exhausted'; end if;
    agency_id := invitation.agency_id;
  else
    agency_id := p_direct_agency_id;
  end if;
  if p_expected_agency_id is not null and agency_id is distinct from p_expected_agency_id then
    raise exception 'invite_invalid';
  end if;
  if agency_id is not null and not exists (
    select 1 from public.partner_agencies a where a.id = agency_id and a.active
  ) then raise exception 'invite_disabled'; end if;

  select * into existing from public.creator_accounts where lower(email) = p_email for update;
  if found then
    if existing.auth_user_id is not null then raise exception 'registration_exists'; end if;
    update public.creator_accounts set auth_user_id = p_user_id, email = p_email,
      display_name = p_display_name, updated_at = now() where id = existing.id returning id into account_id;
  else
    insert into public.creator_accounts(auth_user_id,email,display_name,account_status,source)
      values(p_user_id,p_email,p_display_name,'applicant',case when agency_id is null then 'twin' else 'agency_invite' end)
      returning id into account_id;
  end if;
  insert into public.creator_onboarding_progress(creator_account_id) values(account_id)
    on conflict (creator_account_id) do nothing;
  if agency_id is not null then
    insert into public.creator_agency_assignments(creator_account_id,agency_id,assignment_source,assigned_at)
      values(account_id,agency_id,case when p_code_hash is null then 'direct' else 'invite' end,now())
      on conflict (creator_account_id) do update set agency_id=excluded.agency_id,
        assignment_source=excluded.assignment_source,assigned_at=excluded.assigned_at;
  end if;
  if p_code_hash is not null then
    update public.creator_agency_codes set uses=uses+1,updated_at=now() where id=invitation.id;
  end if;
  return account_id;
end;
$$;
revoke all on function public.provision_creator_registration(uuid,text,text,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.provision_creator_registration(uuid,text,text,text,uuid,uuid) to service_role;

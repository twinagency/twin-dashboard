-- Additive upgrade of the existing owner session store. No live rows deleted.
begin;
alter table public.dashboard_owner_sessions alter column account_id drop not null;
alter table public.dashboard_owner_sessions alter column credential_version drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.dashboard_owner_sessions'::regclass
      and conname = 'dashboard_owner_session_identity_pair') then
    alter table public.dashboard_owner_sessions add constraint dashboard_owner_session_identity_pair
      check ((account_id is null) = (credential_version is null));
  end if;
end $$;
create or replace function public.dashboard_admin_session_create(p_session_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  insert into public.dashboard_owner_sessions(token_hash, account_id, credential_version)
    values (p_session_hash, null, null);
  return true;
end;
$$;
revoke all on function public.dashboard_admin_session_create(text) from public, anon, authenticated;
grant execute on function public.dashboard_admin_session_create(text) to service_role;
create or replace function public.dashboard_owner_session_verify(p_session_hash text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.dashboard_owner_sessions s
    left join public.dashboard_owner_accounts a on a.id = s.account_id
    where s.token_hash = p_session_hash and s.expires_at > now()
      and ((s.account_id is null and s.credential_version is null)
        or (a.active and a.credential_version = s.credential_version))
  );
$$;
revoke all on function public.dashboard_owner_session_verify(text) from public, anon, authenticated;
grant execute on function public.dashboard_owner_session_verify(text) to service_role;
create or replace function public.dashboard_owner_session_revoke(p_session_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  delete from public.dashboard_owner_sessions where token_hash = p_session_hash;
  return true; -- Already absent/expired tokens are idempotently signed out.
end;
$$;
revoke all on function public.dashboard_owner_session_revoke(text) from public, anon, authenticated;
grant execute on function public.dashboard_owner_session_revoke(text) to service_role;
commit;

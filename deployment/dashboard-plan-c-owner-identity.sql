-- Named owner lookup for Plan C. Apply only with an approved release, never automatically.
-- Shared password-admin sessions have no account_id and are intentionally excluded.
begin;
create or replace function public.dashboard_plan_c_owner_identity(p_session_hash text)
returns uuid language sql stable security invoker set search_path = '' as $$
  select a.id from public.dashboard_owner_sessions s
  join public.dashboard_owner_accounts a on a.id = s.account_id
  where p_session_hash ~ '^[a-f0-9]{64}$' and s.token_hash = p_session_hash
    and s.expires_at > now() and a.active and a.credential_version = s.credential_version;
$$;
revoke all on function public.dashboard_plan_c_owner_identity(text) from public, anon, authenticated;
grant execute on function public.dashboard_plan_c_owner_identity(text) to service_role;
commit;

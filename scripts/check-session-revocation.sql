-- Run only in a disposable PostgreSQL test database after both deployment schemas.
begin;
set local role service_role;
do $$
declare
  first_hash text := encode(extensions.gen_random_bytes(32), 'hex');
  second_hash text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  assert current_database() like 'of_auth_%' or current_database() like 'of_test_%';
  assert not has_function_privilege('anon','public.dashboard_admin_session_create(text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.dashboard_owner_session_revoke(text)','EXECUTE');
  assert not public.dashboard_admin_session_create('invalid');
  assert public.dashboard_admin_session_create(first_hash);
  assert public.dashboard_admin_session_create(second_hash);
  assert public.dashboard_owner_session_verify(first_hash);
  assert public.dashboard_owner_session_revoke(first_hash);
  assert not public.dashboard_owner_session_verify(first_hash);
  assert public.dashboard_owner_session_verify(second_hash);
  assert public.dashboard_owner_session_revoke(first_hash);
  assert not public.dashboard_owner_session_revoke('invalid');
end $$;
rollback;

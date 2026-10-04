-- Disposable, rollback-only database regression suite; run after the owner schema.
begin;
set local role service_role;
do $$
declare
  fixture text := 'owner-check-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  account uuid;
  token text := encode(extensions.gen_random_bytes(32), 'hex');
  i integer;
begin
  assert not has_table_privilege('anon', 'public.dashboard_owner_accounts', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.dashboard_owner_sessions', 'INSERT');
  assert not has_function_privilege('anon', 'public.dashboard_owner_login(text,text,text)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.dashboard_owner_session_verify(text)', 'EXECUTE');
  insert into public.dashboard_owner_accounts(username, display_name, password_hash)
    values(fixture, 'Disposable transaction-only fixture', extensions.crypt('fixture-password-only', extensions.gen_salt('bf', 12)))
    returning id into account;
  assert not public.dashboard_owner_login(fixture, 'wrong', token);
  assert not public.dashboard_owner_session_verify(token);
  assert public.dashboard_owner_login(fixture, 'fixture-password-only', token);
  assert public.dashboard_owner_session_verify(token);
  update public.dashboard_owner_accounts set active = false where id = account;
  assert not public.dashboard_owner_session_verify(token);
  assert not public.dashboard_owner_login(fixture, 'fixture-password-only', repeat('a',64));
  update public.dashboard_owner_accounts set active = true,
    password_hash = extensions.crypt('fixture-new-password', extensions.gen_salt('bf',12)) where id = account;
  assert not public.dashboard_owner_session_verify(token);
  for i in 1..5 loop
    assert not public.dashboard_owner_login(fixture, 'wrong', repeat('b',64));
  end loop;
  assert not public.dashboard_owner_login(fixture, 'fixture-new-password', repeat('b',64));
  update public.dashboard_owner_accounts set locked_until = now() - interval '1 minute' where id = account;
  token := encode(extensions.gen_random_bytes(32), 'hex');
  assert public.dashboard_owner_login(fixture, 'fixture-new-password', token);
  assert public.dashboard_owner_session_verify(token);
  update public.dashboard_owner_sessions set expires_at = now() - interval '1 minute' where token_hash = token;
  assert not public.dashboard_owner_session_verify(token);
end;
$$;
rollback;
select 'Owner permissions, passwords, revocation, lockout and expiry passed; fixtures rolled back.' as result;

-- Named full-owner accounts. Execute once per independent dashboard database.
-- No credentials belong in this file. Only the server service role can access it.
create table public.dashboard_owner_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  display_name text not null,
  password_hash text not null check (password_hash ~ '^\$2[aby]\$12\$'),
  active boolean not null default true,
  credential_version uuid not null default gen_random_uuid(),
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.dashboard_owner_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  account_id uuid not null references public.dashboard_owner_accounts(id) on delete cascade,
  credential_version uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);
create index dashboard_owner_sessions_account_idx on public.dashboard_owner_sessions(account_id);
alter table public.dashboard_owner_accounts enable row level security;
alter table public.dashboard_owner_sessions enable row level security;
revoke all on public.dashboard_owner_accounts, public.dashboard_owner_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.dashboard_owner_accounts, public.dashboard_owner_sessions to service_role;

create function public.dashboard_owner_rotate_credential() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.password_hash is distinct from old.password_hash then
    new.credential_version := gen_random_uuid();
    new.failed_attempts := 0;
    new.locked_until := null;
  end if;
  return new;
end;
$$;
revoke all on function public.dashboard_owner_rotate_credential() from public, anon, authenticated;
grant execute on function public.dashboard_owner_rotate_credential() to service_role;
create trigger dashboard_owner_password_changed before update on public.dashboard_owner_accounts
for each row execute function public.dashboard_owner_rotate_credential();

create function public.dashboard_owner_login(p_username text, p_password text, p_session_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  account public.dashboard_owner_accounts%rowtype;
  failures integer;
begin
  if p_username is null or p_username !~ '^[a-z0-9][a-z0-9._-]{2,63}$'
    or p_password is null or octet_length(p_password) not between 1 and 72
    or p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then
    return false;
  end if;
  select * into account from public.dashboard_owner_accounts
    where username = p_username for update;
  if not found or not account.active or account.locked_until > now() then return false; end if;
  if extensions.crypt(p_password, account.password_hash) <> account.password_hash then
    failures := case when account.locked_until is not null and account.locked_until <= now()
      then 1 else account.failed_attempts + 1 end;
    update public.dashboard_owner_accounts set failed_attempts = failures,
      locked_until = case when failures >= 5 then now() + interval '15 minutes' else null end
      where id = account.id;
    return false;
  end if;
  update public.dashboard_owner_accounts set failed_attempts = 0, locked_until = null,
    last_login_at = now() where id = account.id;
  delete from public.dashboard_owner_sessions where account_id = account.id and expires_at <= now();
  insert into public.dashboard_owner_sessions(token_hash, account_id, credential_version)
    values (p_session_hash, account.id, account.credential_version);
  return true;
end;
$$;
revoke all on function public.dashboard_owner_login(text,text,text) from public, anon, authenticated;
grant execute on function public.dashboard_owner_login(text,text,text) to service_role;

create function public.dashboard_owner_session_verify(p_session_hash text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.dashboard_owner_sessions s
    join public.dashboard_owner_accounts a on a.id = s.account_id
    where s.token_hash = p_session_hash and s.expires_at > now()
      and a.active and a.credential_version = s.credential_version
  );
$$;
revoke all on function public.dashboard_owner_session_verify(text) from public, anon, authenticated;
grant execute on function public.dashboard_owner_session_verify(text) to service_role;

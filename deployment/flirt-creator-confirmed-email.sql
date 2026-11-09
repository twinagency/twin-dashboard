-- Apply only to the separate FLIRT Auth database before releasing account settings.
create schema if not exists flirt_auth_private;
revoke all on schema flirt_auth_private from public, anon, authenticated;

create or replace function flirt_auth_private.sync_creator_login_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.creator_accounts
     set email = lower(new.email)
   where auth_user_id = new.id
     and email is distinct from lower(new.email);
  return new;
end;
$$;

revoke all on function flirt_auth_private.sync_creator_login_email() from public, anon, authenticated;

create trigger flirt_sync_creator_login_email
after update of email on auth.users
for each row
when (old.email is distinct from new.email and new.email is not null)
execute function flirt_auth_private.sync_creator_login_email();

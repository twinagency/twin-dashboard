-- Isolated database fixture; never run against an application database.
\set ON_ERROR_STOP on
select current_database()='creator_platforms_test' as disposable \gset
\if :disposable
\else
\quit 3
\endif
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create table public.partner_agencies(id uuid primary key,active boolean not null default true);
create table public.agency_creators(agency_id uuid,clone_id uuid);
create table public.agency_memberships(user_id uuid primary key references auth.users(id),agency_id uuid not null references partner_agencies(id),email text not null,active boolean not null default true,can_manage boolean not null default false,creator_scope text not null default 'all',creator_ids uuid[] not null default '{}',creator_access_revision uuid not null default gen_random_uuid(),unique(agency_id,email));
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
grant usage on schema public to service_role;
grant all on public.partner_agencies,public.agency_creators,public.agency_memberships to service_role;
\ir ../supabase/migrations/20261021204833_agency_team_onboarding.sql
-- FIXTURES
insert into auth.users select ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,6) i;
insert into partner_agencies values('20000000-0000-4000-8000-000000000001',true),('20000000-0000-4000-8000-000000000002',true);
insert into agency_creators values('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
insert into agency_memberships(user_id,agency_id,email) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','owner@example.test'),('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','staff@example.test');
insert into agency_team_owners(user_id,agency_id) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
set local role service_role;
do $$
declare owner_id uuid:='10000000-0000-4000-8000-000000000001'; agency uuid:='20000000-0000-4000-8000-000000000001'; staff uuid:='10000000-0000-4000-8000-000000000002'; newcomer uuid:='10000000-0000-4000-8000-000000000003'; invite_id uuid; command jsonb;
begin
  assert not has_table_privilege('anon','agency_team_invites','select');
  assert not has_table_privilege('authenticated','agency_team_owners','insert');
  assert not has_function_privilege('authenticated','agency_team_command(uuid,uuid,jsonb)','execute');
  assert not has_function_privilege('anon','agency_team_accept(uuid,text,text)','execute');
  assert (select relrowsecurity from pg_class where oid='agency_team_invites'::regclass);
  command:=jsonb_build_object('operation','invite','email','new@example.test','token_hash',repeat('a',64),'can_manage',false,'creator_scope','selected','creator_ids',jsonb_build_array('30000000-0000-4000-8000-000000000001'));
  begin perform agency_team_command(staff,agency,command); raise exception 'FAIL: ordinary staff invited'; exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform agency_team_command(owner_id,'20000000-0000-4000-8000-000000000002',command); raise exception 'FAIL: cross agency invited'; exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform agency_team_command(owner_id,agency,command||'{"creator_ids":["30000000-0000-4000-8000-000000000002"]}'::jsonb); raise exception 'FAIL: foreign creator assigned'; exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  invite_id:=agency_team_command(owner_id,agency,command);
  begin perform agency_team_accept(newcomer,repeat('a',64),'wrong@example.test');raise exception 'FAIL: wrong email accepted';exception when raise_exception then if sqlerrm like 'FAIL:%' then raise;end if;end;
  assert (select accepted_at is null from agency_team_invites where id=invite_id);
  perform agency_team_accept(newcomer,repeat('a',64),'new@example.test');
  assert (select creator_scope='selected' and cardinality(creator_ids)=1 and not can_manage from agency_memberships where user_id=newcomer);
  begin perform agency_team_accept(newcomer,repeat('a',64),'new@example.test');raise exception 'FAIL: invitation reused';exception when raise_exception then if sqlerrm like 'FAIL:%' then raise;end if;end;
  begin perform agency_team_command(owner_id,agency,jsonb_build_object('operation','remove','user_id',owner_id,'revision',(select creator_access_revision from agency_memberships where user_id=owner_id)));raise exception 'FAIL: owner removed self';exception when raise_exception then if sqlerrm like 'FAIL:%' then raise;end if;end;
  perform agency_team_command(owner_id,agency,jsonb_build_object('operation','remove','user_id',newcomer,'revision',(select creator_access_revision from agency_memberships where user_id=newcomer)));
  assert (select not active from agency_memberships where user_id=newcomer);
  invite_id:=agency_team_command(owner_id,agency,command||jsonb_build_object('email','next@example.test','token_hash',repeat('b',64)));
  perform agency_team_command(owner_id,agency,jsonb_build_object('operation','revoke-invite','id',invite_id));
  begin perform agency_team_accept('10000000-0000-4000-8000-000000000004',repeat('b',64),'next@example.test');raise exception 'FAIL: revoked invitation accepted';exception when raise_exception then if sqlerrm like 'FAIL:%' then raise;end if;end;
  invite_id:=agency_team_command(owner_id,agency,command||jsonb_build_object('email','last@example.test','token_hash',repeat('c',64)));
  update agency_team_invites set expires_at=now()-interval '1 second' where id=invite_id;
  begin perform agency_team_accept('10000000-0000-4000-8000-000000000005',repeat('c',64),'last@example.test');raise exception 'FAIL: expired invitation accepted';exception when raise_exception then if sqlerrm like 'FAIL:%' then raise;end if;end;
  update agency_team_invites set expires_at=now()+interval '1 day' where id=invite_id;
  begin perform agency_team_accept(staff,repeat('c',64),'last@example.test');raise exception 'FAIL: existing membership overwritten';exception when raise_exception then if sqlerrm like 'FAIL:%' then raise;end if;end;
  begin perform agency_team_command(owner_id,agency,jsonb_build_object('operation','remove','user_id',staff,'revision',gen_random_uuid()));raise exception 'FAIL: stale revision accepted';exception when raise_exception then if sqlerrm like 'FAIL:%' then raise;end if;end;
  update agency_memberships set active=false where user_id=owner_id;
  begin perform agency_team_accept('10000000-0000-4000-8000-000000000005',repeat('c',64),'last@example.test');raise exception 'FAIL: revoked owner invitation accepted';exception when raise_exception then if sqlerrm like 'FAIL:%' then raise;end if;end;
end $$;
rollback;

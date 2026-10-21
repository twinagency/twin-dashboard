-- Disposable PostgreSQL only. Never run against an application database.
\set ON_ERROR_STOP on
select current_database()='creator_platforms_test' as disposable \gset
\if :disposable
\else
\echo 'Refusing non-disposable database'
\quit 3
\endif
begin;
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.clones(id uuid primary key);
create table public.agency_memberships(user_id uuid primary key, agency_id uuid not null);
insert into public.clones values ('10000000-0000-4000-8000-000000000001');
insert into public.agency_memberships values ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
\ir ../supabase/migrations/20261021194615_staff_creator_scope_and_shared_media.sql
do $$ begin
 assert (select creator_scope='all' and creator_ids='{}'::uuid[] and creator_access_revision is not null from public.agency_memberships);
 update public.agency_memberships set creator_scope='selected';
 assert (select cardinality(creator_ids)=0 from public.agency_memberships);
 update public.agency_memberships set creator_ids=array['10000000-0000-4000-8000-000000000001']::uuid[];
 begin update public.agency_memberships set creator_scope='all';raise exception 'invalid all scope accepted';exception when check_violation then null;end;
 begin update public.agency_memberships set creator_ids=array[null]::uuid[];raise exception 'null creator accepted';exception when check_violation then null;end;
 assert (select relrowsecurity from pg_class where oid='public.shared_media_transfers'::regclass);
 assert not has_table_privilege('anon','public.shared_media_transfers','select');
 assert not has_table_privilege('authenticated','public.shared_media_transfers','select');
 assert not has_table_privilege('authenticated','public.shared_media_transfers','insert');
 assert not has_table_privilege('authenticated','public.shared_media_transfers','update');
 assert not has_table_privilege('service_role','public.shared_media_transfers','delete');
 assert has_table_privilege('service_role','public.shared_media_transfers','select,insert,update');
end $$;
grant usage on schema public to service_role;
set local role service_role;
insert into public.shared_media_transfers(clone_id,source_kind,source_id,account_id,storage_path,file_name,size_bytes,source_sha256,chunk_sha256,connection_revision,actor)
 values('10000000-0000-4000-8000-000000000001','photo','40000000-0000-4000-8000-000000000001','fixture-account','private-source','photo.jpg',8,repeat('a',64),array[repeat('a',64)],1,'synthetic-user');
do $$ begin
 assert (select status='prepared' and received_bytes=0 from public.shared_media_transfers);
 begin insert into public.shared_media_transfers select gen_random_uuid(),clone_id,source_kind,source_id,account_id,storage_path,file_name,size_bytes,source_sha256,chunk_sha256,file_id,connection_revision,actor,job_id,media_id,status,processing,received_bytes,error_code,created_at,updated_at from public.shared_media_transfers;raise exception 'duplicate receipt accepted';exception when unique_violation then null;end;
 begin update public.shared_media_transfers set received_bytes=9;raise exception 'oversize receipt accepted';exception when check_violation then null;end;
 update public.shared_media_transfers set received_bytes=8;
 assert (select received_bytes=8 from public.shared_media_transfers);
end $$;
reset role;
rollback;
\echo 'PASS: existing membership defaults, selected-empty scope, scope constraints, private receipts, service permissions, duplicate receipt prevention and byte bounds'

-- Disposable PostgreSQL only. Never run against an application database.
\set ON_ERROR_STOP on
select current_database()='creator_platforms_test' as disposable \gset
\if :disposable
\else
\echo 'Refusing non-disposable database'
\quit 3
\endif
begin;
create role anon;create role authenticated;create role service_role;
create table public.clones(id uuid primary key,slug text unique not null,name text not null,bot_token text not null,status text not null,engine text,voice_enabled boolean,charge_messages boolean,drip_enabled boolean,uses_default_config boolean);
create table public.creator_accounts(id uuid primary key,auth_user_id uuid not null,display_name text not null,account_status text not null default 'applicant',source text not null default 'twin',updated_at timestamptz default now());
create table public.partner_agencies(id uuid primary key,active boolean not null);
create table public.creator_agency_assignments(creator_account_id uuid primary key references public.creator_accounts(id),agency_id uuid references public.partner_agencies(id));
create table public.creator_clone_links(creator_account_id uuid primary key references public.creator_accounts(id),clone_id uuid references public.clones(id),twin_slug text,linked_at timestamptz default now());
create table public.agency_creators(agency_id uuid references public.partner_agencies(id),clone_id uuid references public.clones(id),primary key(agency_id,clone_id));
insert into public.creator_accounts(id,auth_user_id,display_name,source) values
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','OF only','twin'),
('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Agency both','agency_invite'),
('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','Existing Telegram','twin'),
('00000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004','Inactive agency','agency_invite'),
('00000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000005','Unmodified','twin');
insert into public.clones values('20000000-0000-0000-0000-000000000003','existing-tg','Existing Telegram','synthetic-token','active','live',true,true,true,true);
insert into public.creator_clone_links(creator_account_id,clone_id,twin_slug) values('00000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','existing-tg');
insert into public.partner_agencies values('30000000-0000-0000-0000-000000000001',true),('30000000-0000-0000-0000-000000000002',false);
insert into public.creator_agency_assignments values('00000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000002');
\ir ../deployment/creator-platforms.sql
-- Reapplication is safe and preserves data.
\ir ../deployment/creator-platforms.sql
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
set local role service_role;
do $$ declare p uuid;begin
 p:=public.setup_creator_platforms('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',array['onlyfans']);
 assert p='00000000-0000-0000-0000-000000000001';
 assert public.setup_creator_platforms('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',array['onlyfans'])=p;
 assert exists(select 1 from public.clones where id=p and bot_token='' and status='paused' and not voice_enabled and not charge_messages and not drip_enabled);
 assert not exists(select 1 from public.creator_clone_links where creator_account_id=p);
 assert (select account_status='applicant' and display_name='OF only' from public.creator_accounts where id=p);
 assert public.setup_creator_platforms('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003',array['telegram','onlyfans'])='20000000-0000-0000-0000-000000000003';
 p:=public.setup_creator_platforms('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',array['telegram','onlyfans']);
 assert (select count(*)=1 from public.agency_creators where clone_id=p and agency_id='30000000-0000-0000-0000-000000000001');
 assert not exists(select 1 from public.agency_creators where agency_id='30000000-0000-0000-0000-000000000002');
 begin perform public.setup_creator_platforms('00000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001',array['onlyfans']);raise exception 'wrong user accepted';exception when raise_exception then if sqlerrm<>'creator_unavailable' then raise;end if;end;
 begin perform public.setup_creator_platforms('00000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004',array['onlyfans']);raise exception 'inactive agency accepted';exception when raise_exception then if sqlerrm<>'creator_unavailable' then raise;end if;end;
 begin perform public.setup_creator_platforms('00000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000005',array['onlyfans','onlyfans']);raise exception 'duplicate platform accepted';exception when raise_exception then if sqlerrm<>'platform_choice_invalid' then raise;end if;end;
 begin perform public.link_creator_platform_profile('00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003');raise exception 'identity changed';exception when raise_exception then if sqlerrm<>'Use the existing platform creator profile' then raise;end if;end;
 begin perform public.link_creator_platform_profile('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001');raise exception 'reserved profile stolen';exception when raise_exception then if sqlerrm<>'This profile is attached to another creator account' then raise;end if;end;
 assert (select clone_id='20000000-0000-0000-0000-000000000003' from public.creator_clone_links where creator_account_id='00000000-0000-0000-0000-000000000003');
 perform public.link_creator_platform_profile('00000000-0000-0000-0000-000000000003',null);
 assert (select platform_creator_id='20000000-0000-0000-0000-000000000003' from public.creator_accounts where id='00000000-0000-0000-0000-000000000003');
 perform public.link_creator_platform_profile('00000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003');
 assert (select count(*)=3 from public.clones);
 assert (select platform_creator_id is null and requested_channels='{}'::text[] from public.creator_accounts where id='00000000-0000-0000-0000-000000000005');
end $$;
reset role;
do $$ begin
 assert not has_function_privilege('anon','public.setup_creator_platforms(uuid,uuid,text[])','execute');
 assert not has_function_privilege('authenticated','public.setup_creator_platforms(uuid,uuid,text[])','execute');
 assert not has_function_privilege('anon','public.link_creator_platform_profile(uuid,uuid)','execute');
 assert not has_function_privilege('authenticated','public.link_creator_platform_profile(uuid,uuid)','execute');
 assert has_function_privilege('service_role','public.link_creator_platform_profile(uuid,uuid)','execute');
end $$;
rollback;
\echo 'PASS: canonical identity, exact owner, OF-only paused profile, Telegram reuse, agency isolation, atomic relink, service-only RPCs'

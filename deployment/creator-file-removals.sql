-- Service-only journal for creator-requested draft content removal. Apply after
-- creator-upload-receipts.sql. The path tombstone prevents later reference reuse.
create table if not exists public.creator_file_removals (
  file_id uuid primary key,
  creator_account_id uuid not null references public.creator_accounts(id) on delete cascade,
  bucket text not null,
  storage_path text not null,
  state text not null check (state in ('removing','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bucket,storage_path)
);
create index if not exists creator_file_removals_owner_state on public.creator_file_removals(creator_account_id,state);
create index if not exists creator_file_removals_path on public.creator_file_removals(storage_path);
alter table public.creator_file_removals enable row level security;
revoke all on public.creator_file_removals from public,anon,authenticated;
grant all on public.creator_file_removals to service_role;

create or replace function public.begin_creator_file_removal(p_creator_id uuid,p_file_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.creator_files%rowtype; removal public.creator_file_removals%rowtype; application_status text;
begin
  if p_creator_id is null or p_file_id is null then raise exception 'file_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('creator_file_lifecycle:'||p_creator_id::text,0));
  select * into removal from public.creator_file_removals where file_id=p_file_id for update;
  if found then
    if removal.creator_account_id<>p_creator_id then return jsonb_build_object('state','removed'); end if;
    return to_jsonb(removal);
  end if;
  select * into saved from public.creator_files where id=p_file_id and creator_account_id=p_creator_id for update;
  if not found then return jsonb_build_object('state','removed'); end if;
  if saved.kind is null or saved.bucket is null or saved.storage_path is null
    or saved.kind not in ('content','content_sfw_image','content_nsfw_image','content_sfw_video','content_nsfw_video','voice')
    or saved.bucket<>(case when saved.kind='voice' then 'voice-samples' else 'onboarding-content' end)
    or left(saved.storage_path,length('creators/'||p_creator_id||'/'))<>'creators/'||p_creator_id||'/'
    or saved.storage_path ~ '(^|/)[.]{1,2}(/|$)' then raise exception 'file_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('creator_file_path:'||saved.storage_path,0));
  select status into application_status from public.creator_applications where creator_account_id=p_creator_id order by created_at desc limit 1;
  if (application_status is not null and application_status<>'draft')
    or exists(select 1 from public.creator_clone_links where creator_account_id=p_creator_id)
    or exists(select 1 from public.photos where storage_path=saved.storage_path)
    or exists(select 1 from public.videos where storage_path=saved.storage_path)
    or exists(select 1 from public.photo_bundle_items where storage_path=saved.storage_path)
    or exists(select 1 from public.video_sequence_jobs where source_storage_path=saved.storage_path)
    or exists(select 1 from public.creator_files where bucket=saved.bucket and storage_path=saved.storage_path and id<>p_file_id)
    then raise exception 'content_in_use'; end if;
  insert into public.creator_file_removals(file_id,creator_account_id,bucket,storage_path,state)
    values(saved.id,p_creator_id,saved.bucket,saved.storage_path,'removing') returning * into removal;
  -- Retries/status polling must not claim this saved file is usable while it is
  -- being removed. Keep file_id and object references until confirmed deletion.
  update public.creator_upload_receipts set state='removing',lease_until=now(),updated_at=now()
    where creator_account_id=p_creator_id and (id=p_file_id or file_id=p_file_id);
  return to_jsonb(removal);
end;
$$;

-- Called only after the authorized Storage API confirms that the object is absent.
-- Keep all durable references until this transaction can complete atomically.
create or replace function public.finish_creator_file_removal(p_creator_id uuid,p_file_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare removal public.creator_file_removals%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('creator_file_lifecycle:'||p_creator_id::text,0));
  select * into removal from public.creator_file_removals where file_id=p_file_id and creator_account_id=p_creator_id for update;
  if not found then raise exception 'removal_unavailable'; end if;
  if removal.state='removed' then return true; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('creator_file_path:'||removal.storage_path,0));
  update public.creator_upload_receipts set state='removed',lease_until=now(),updated_at=now()
    where creator_account_id=p_creator_id and (id=p_file_id or file_id=p_file_id);
  delete from public.creator_files where id=p_file_id and creator_account_id=p_creator_id and bucket=removal.bucket and storage_path=removal.storage_path;
  update public.creator_file_removals set state='removed',updated_at=now() where file_id=p_file_id;
  return true;
end;
$$;

-- A submission or clone connection must not race with a removal in progress.
-- Existing submitted accounts and unrelated creators are unaffected.
create or replace function public.guard_creator_file_lifecycle()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='creator_applications' then
    if new.status='draft' then return new; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('creator_file_lifecycle:'||new.creator_account_id::text,0));
  if exists(select 1 from public.creator_file_removals where creator_account_id=new.creator_account_id and state='removing')
    then raise exception 'creator_file_removal_pending'; end if;
  return new;
end;
$$;
drop trigger if exists creator_application_file_lifecycle on public.creator_applications;
create trigger creator_application_file_lifecycle before insert or update of status,creator_account_id on public.creator_applications
  for each row execute function public.guard_creator_file_lifecycle();
drop trigger if exists creator_clone_file_lifecycle on public.creator_clone_links;
create trigger creator_clone_file_lifecycle before insert or update on public.creator_clone_links
  for each row execute function public.guard_creator_file_lifecycle();

-- Downstream reference writes participate in the same path lock. Retain the
-- removed tombstone so a stale asynchronous importer cannot adopt a deleted path.
create or replace function public.guard_creator_file_reference()
returns trigger language plpgsql security definer set search_path='' as $$
declare object_path text;
begin
  object_path:=to_jsonb(new)->>tg_argv[0];
  if object_path is null or left(object_path,9)<>'creators/' then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('creator_file_path:'||object_path,0));
  if exists(select 1 from public.creator_file_removals where storage_path=object_path)
    then raise exception 'creator_file_unavailable'; end if;
  return new;
end;
$$;
drop trigger if exists creator_file_photo_reference on public.photos;
create trigger creator_file_photo_reference before insert or update of storage_path on public.photos for each row execute function public.guard_creator_file_reference('storage_path');
drop trigger if exists creator_file_video_reference on public.videos;
create trigger creator_file_video_reference before insert or update of storage_path on public.videos for each row execute function public.guard_creator_file_reference('storage_path');
drop trigger if exists creator_file_bundle_reference on public.photo_bundle_items;
create trigger creator_file_bundle_reference before insert or update of storage_path on public.photo_bundle_items for each row execute function public.guard_creator_file_reference('storage_path');
drop trigger if exists creator_file_sequence_reference on public.video_sequence_jobs;
create trigger creator_file_sequence_reference before insert or update of source_storage_path on public.video_sequence_jobs for each row execute function public.guard_creator_file_reference('source_storage_path');
drop trigger if exists creator_file_saved_reference on public.creator_files;
create trigger creator_file_saved_reference before insert or update of storage_path on public.creator_files for each row execute function public.guard_creator_file_reference('storage_path');

revoke all on function public.begin_creator_file_removal(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_creator_file_removal(uuid,uuid) from public,anon,authenticated;
revoke all on function public.guard_creator_file_lifecycle() from public,anon,authenticated;
revoke all on function public.guard_creator_file_reference() from public,anon,authenticated;
grant execute on function public.begin_creator_file_removal(uuid,uuid) to service_role;
grant execute on function public.finish_creator_file_removal(uuid,uuid) to service_role;

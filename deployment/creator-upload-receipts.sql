create table if not exists public.creator_upload_receipts (
  id uuid primary key,
  creator_account_id uuid not null references public.creator_accounts(id) on delete cascade,
  kind text not null, bucket text not null, storage_path text not null,
  original_name text not null, mime_type text not null, size_bytes bigint not null,
  content_sha256 text not null,
  state text not null default 'uploading' check (state in ('uploading','stored','saved','failed','removing','removed')),
  lease_token uuid not null, lease_until timestamptz not null,
  file_id uuid references public.creator_files(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists creator_upload_receipts_owner on public.creator_upload_receipts(creator_account_id,updated_at);
create index if not exists creator_upload_receipts_file on public.creator_upload_receipts(file_id);
alter table public.creator_upload_receipts enable row level security;
revoke all on public.creator_upload_receipts from public, anon, authenticated;
grant all on public.creator_upload_receipts to service_role;

alter table public.creator_upload_receipts drop constraint if exists creator_upload_receipts_state_check;
alter table public.creator_upload_receipts add constraint creator_upload_receipts_state_check check (state in ('uploading','stored','saved','failed','removing','removed'));

create or replace function public.claim_creator_upload(
  p_creator_id uuid,p_upload_id uuid,p_kind text,p_name text,p_mime text,p_bytes bigint,p_sha256 text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  receipt public.creator_upload_receipts%rowtype;
  used_bytes bigint; used_count bigint; reserved_bytes bigint; reserved_count bigint;
  bucket_name text;
begin
  if p_creator_id is null or p_upload_id is null or p_bytes is null or p_kind is null or p_mime is null or p_name is null or p_sha256 is null or p_bytes <= 0 or p_bytes > 536870912 or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_kind not in ('content','content_sfw_image','content_nsfw_image','content_sfw_video','content_nsfw_video','voice')
    or (p_kind like '%_image' and p_bytes > 78643200) or (p_kind='voice' and p_bytes > 67108864)
    or (p_kind='content' and (p_mime not in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm') or (p_mime like 'image/%' and p_bytes > 78643200)))
    then raise exception 'upload_invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('creator_upload:'||p_creator_id::text,0));
  select * into receipt from public.creator_upload_receipts where id=p_upload_id for update;
  if found then
    if receipt.creator_account_id <> p_creator_id or receipt.content_sha256 <> p_sha256
      or receipt.kind <> p_kind or receipt.size_bytes <> p_bytes or receipt.mime_type <> p_mime
      then raise exception 'upload_conflict'; end if;
    if receipt.state in ('removed','removing') or (receipt.state='saved' and receipt.file_id is null) then
      return jsonb_build_object('state','removed');
    end if;
    if receipt.state='saved' then return to_jsonb(receipt); end if;
    if receipt.lease_until > now() then return jsonb_build_object('state','busy'); end if;
  end if;
  select coalesce(sum(size_bytes),0),count(*) into used_bytes,used_count
    from public.creator_files where creator_account_id=p_creator_id;
  -- Stored-but-unrecorded objects retain their quota reservation until reconciled/cleaned.
  select coalesce(sum(size_bytes),0),count(*) into reserved_bytes,reserved_count
    from public.creator_upload_receipts where creator_account_id=p_creator_id and id<>p_upload_id
      and file_id is null and state in ('stored','uploading','removing');
  if used_bytes+reserved_bytes+p_bytes > 107374182400 or used_count+reserved_count >= 5000
    then raise exception 'upload_quota'; end if;
  bucket_name := case when p_kind='voice' then 'voice-samples' else 'onboarding-content' end;
  if receipt.id is null then
    insert into public.creator_upload_receipts(id,creator_account_id,kind,bucket,storage_path,original_name,mime_type,size_bytes,content_sha256,lease_token,lease_until)
      values(p_upload_id,p_creator_id,p_kind,bucket_name,'creators/'||p_creator_id||'/'||p_kind||'/'||p_upload_id,p_name,p_mime,p_bytes,p_sha256,gen_random_uuid(),now()+interval '30 minutes')
      returning * into receipt;
  else
    update public.creator_upload_receipts set lease_token=gen_random_uuid(),lease_until=now()+interval '30 minutes',updated_at=now()
      where id=p_upload_id returning * into receipt;
  end if;
  return to_jsonb(receipt);
end;
$$;

create or replace function public.finish_creator_upload(p_creator_id uuid,p_upload_id uuid,p_lease_token uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare receipt public.creator_upload_receipts%rowtype; saved_id uuid;
begin
  select * into receipt from public.creator_upload_receipts where id=p_upload_id and creator_account_id=p_creator_id for update;
  if not found then raise exception 'upload_unavailable'; end if;
  if receipt.state='saved' and receipt.file_id is not null then return receipt.file_id; end if;
  if p_lease_token is null or receipt.state<>'stored' or receipt.lease_token <> p_lease_token then raise exception 'upload_conflict'; end if;
  -- The only caller has verified both the media and successful private storage.
  insert into public.creator_files(id,creator_account_id,kind,bucket,storage_path,mime_type,size_bytes,original_name,
    storage_transfer_status,storage_verified_at,source_object_status,source_object_checked_at)
    values(receipt.id,receipt.creator_account_id,receipt.kind,receipt.bucket,receipt.storage_path,receipt.mime_type,receipt.size_bytes,receipt.original_name,
      'verified',now(),'present',now()) returning id into saved_id;
  update public.creator_upload_receipts set state='saved',file_id=saved_id,lease_until=now(),updated_at=now() where id=p_upload_id;
  return saved_id;
end;
$$;
revoke all on function public.claim_creator_upload(uuid,uuid,text,text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.finish_creator_upload(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_creator_upload(uuid,uuid,text,text,text,bigint,text) to service_role;
grant execute on function public.finish_creator_upload(uuid,uuid,uuid) to service_role;

-- Maintenance claims are service-only, target one creator and reject recent/in-use content.
create or replace function public.begin_creator_upload_cleanup(p_creator_id uuid,p_upload_id uuid,p_cutoff timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.creator_upload_receipts%rowtype;
begin
  if p_cutoff is null or p_cutoff > now()-interval '24 hours' then raise exception 'cleanup_cutoff_invalid'; end if;
  select * into receipt from public.creator_upload_receipts where id=p_upload_id and creator_account_id=p_creator_id for update;
  if not found then raise exception 'cleanup_unavailable'; end if;
  if receipt.state='removed' then return jsonb_build_object('state','removed'); end if;
  if receipt.storage_path <> 'creators/'||p_creator_id||'/'||receipt.kind||'/'||p_upload_id
    or receipt.bucket <> (case when receipt.kind='voice' then 'voice-samples' else 'onboarding-content' end)
    then raise exception 'cleanup_path_invalid'; end if;
  if receipt.state='removing' then return to_jsonb(receipt); end if;
  if receipt.file_id is not null or receipt.state='saved' or receipt.lease_until>now() or receipt.updated_at>=p_cutoff
    or exists(select 1 from public.creator_files where id=p_upload_id or (bucket=receipt.bucket and storage_path=receipt.storage_path))
    or exists(select 1 from public.photos where storage_path=receipt.storage_path)
    or exists(select 1 from public.videos where storage_path=receipt.storage_path)
    or exists(select 1 from public.photo_bundle_items where storage_path=receipt.storage_path)
    or exists(select 1 from public.video_sequence_jobs where source_storage_path=receipt.storage_path)
    then raise exception 'cleanup_not_eligible'; end if;
  update public.creator_upload_receipts set state='removing',lease_until=now(),updated_at=now() where id=p_upload_id returning * into receipt;
  return to_jsonb(receipt);
end;
$$;
create or replace function public.finish_creator_upload_cleanup(p_creator_id uuid,p_upload_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.creator_upload_receipts set state='removed',updated_at=now(),lease_until=now()
    where id=p_upload_id and creator_account_id=p_creator_id and state='removing' and file_id is null;
  return found;
end;
$$;
revoke all on function public.begin_creator_upload_cleanup(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.finish_creator_upload_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_creator_upload_cleanup(uuid,uuid,timestamptz) to service_role;
grant execute on function public.finish_creator_upload_cleanup(uuid,uuid) to service_role;



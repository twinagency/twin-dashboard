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

revoke all on function public.claim_creator_upload(uuid,uuid,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.claim_creator_upload(uuid,uuid,text,text,text,bigint,text) to service_role;

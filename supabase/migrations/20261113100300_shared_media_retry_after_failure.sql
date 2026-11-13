-- One LIVE receipt per account+file, not one forever. A retry mints a new file_id, so a retried file that may already be in
-- the OnlyFans vault would upload twice. A receipt is therefore history (the same file may be shared again, the old receipt
-- kept) ONLY when the row proves the provider never received the file: no media_id and exactly expired/media_request_expired
-- or superseded/media_connection_changed, which the backend writes only for a job that never left receiving/pending. Every
-- other receipt is live: active, complete, provider review or cleanup holds, interrupted, any null or unknown error_code.
-- The predicate is LIVE_SHARED_SQL in lib/shared-media.ts, the same definition as the route's lookup filter
-- (asserted by tests/rules/G30b-shared-media-retry-index.test.mjs, also against real PostgreSQL).
-- Apply BEFORE the route deploys: the old route never inserts a second receipt for a source, so it is safe here first.
-- One-way door: once a second receipt exists for a source, the old route's unfiltered lookup fails for it and the old
-- unique constraint cannot be re-added. Existing rows cannot collide: the old constraint allowed one per key.
-- drop then create (not `if not exists`) so a same-named index from an abandoned attempt is replaced, not kept.
begin;
set local lock_timeout = '5s';
alter table public.shared_media_transfers drop constraint if exists shared_media_transfers_account_id_source_kind_source_id_key;
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'public.shared_media_transfers'::regclass and contype = 'u') then
    raise exception 'shared_media_transfers still has a unique constraint; drop it by name before this migration';
  end if;
end $$;
drop index if exists public.shared_media_transfers_live_source;
create unique index shared_media_transfers_live_source on public.shared_media_transfers (account_id, source_kind, source_id)
  where media_id is not null or error_code is null or ((status <> 'expired' or error_code <> 'media_request_expired') and (status <> 'superseded' or error_code <> 'media_connection_changed'));
commit;

-- One LIVE receipt per account+file, not one forever. A receipt in a retryable terminal status (failed, interrupted,
-- superseded, expired) is history: the same file may be shared again and the old receipt is kept. Every other receipt,
-- including complete, is live, and so is a retryable one held for provider cleanup.
-- The predicate must match RETRYABLE_SHARED_STATUSES / SHARED_CLEANUP_HOLD in lib/shared-media.ts exactly
-- (asserted by tests/rules/G30b-shared-media-retry-index.test.mjs). Safe before the route deploys: the old route never
-- inserts a second receipt for a source. Existing rows cannot collide: the old constraint allowed one per key.
begin;
set local lock_timeout = '5s';
alter table public.shared_media_transfers drop constraint if exists shared_media_transfers_account_id_source_kind_source_id_key;
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'public.shared_media_transfers'::regclass and contype = 'u') then
    raise exception 'shared_media_transfers still has a unique constraint; drop it by name before this migration';
  end if;
end $$;
create unique index if not exists shared_media_transfers_live_source on public.shared_media_transfers (account_id, source_kind, source_id)
  where status not in ('failed', 'interrupted', 'superseded', 'expired') or error_code = 'provider_cleanup_required';
commit;

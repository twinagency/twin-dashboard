-- One live receipt per account+file, not one forever: a failed or expired
-- transfer may be retried while its receipt is kept. A receipt held for
-- provider cleanup still blocks a new attempt.
begin;
set local lock_timeout = '5s';
alter table public.shared_media_transfers drop constraint shared_media_transfers_account_id_source_kind_source_id_key;
create unique index shared_media_transfers_live_source on public.shared_media_transfers(account_id, source_kind, source_id)
  where status not in ('failed','expired') or error_code = 'provider_cleanup_required';
commit;

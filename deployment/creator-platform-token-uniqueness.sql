-- Applied to Twin production via allow_creator_profiles_without_telegram_token.
-- A channel-neutral creator has no Telegram token (empty string).
-- Preserve uniqueness for every real token while allowing multiple such profiles.
-- Reproduced the failure on the reported creator; setup passes under service_role
-- with this index in a rolled-back transaction. No creator rows are changed here.
begin;
set local lock_timeout = '5s';
create unique index if not exists clones_bot_token_present_key
  on public.clones(bot_token) where bot_token <> '';
drop index if exists public.clones_bot_token_key;
commit;

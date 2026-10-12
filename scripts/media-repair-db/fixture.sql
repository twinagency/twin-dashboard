-- Minimal fixture of the EXISTING production shape of the tables the media repair batch reads/writes (columns copied from a
-- read-only SELECT * of prod, 2026-10-11). It does NOT include migration 20261012000000: the check applies that, so it can
-- test "before", idempotence and rollback. LOCAL ONLY.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create table public.clones (id uuid primary key default gen_random_uuid(), slug text unique not null, vision_model text);
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  clone_id uuid not null references public.clones(id) on delete cascade,
  storage_path text not null, caption text, teaser_caption text, star_value integer not null, image_name text,
  created_at timestamptz not null default now(), telegram_file_id text,
  is_nude boolean not null default false, explicitness text not null default 'none', is_free boolean not null default false,
  nsfw boolean not null default false, tags text[] not null default '{}', auto_desc text, visual_description text);
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  clone_id uuid not null references public.clones(id) on delete cascade,
  storage_path text not null, caption text, teaser_caption text, star_value integer not null,
  created_at timestamptz not null default now(), telegram_file_id text,
  is_nude boolean not null default false, explicitness text not null default 'none', is_free boolean not null default false,
  nsfw boolean not null default false, tags text[] not null default '{}', auto_desc text, content_family_id uuid, visual_description text);
create table public.photo_bundles (
  id uuid primary key default gen_random_uuid(),
  clone_id uuid not null references public.clones(id) on delete cascade,
  name text not null, caption text, star_price integer not null, is_onboarding boolean not null default false,
  created_at timestamptz not null default now(), campaign_only boolean not null default false);
create table public.photo_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.photo_bundles(id) on delete cascade,
  storage_path text not null, sort_order integer not null default 0, caption text, auto_desc text,
  tags text[] not null default '{}', visual_description text);
-- stands in for ownership/payment tables the batch must never touch
create table public.user_received_media (id uuid primary key default gen_random_uuid(), media_id uuid not null, media_type text not null);


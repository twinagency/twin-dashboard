-- Existing staff retain their current agency scope. New restrictions are
-- server-owned and intersected with current agency assignments on every request.
alter table public.agency_memberships
  add column creator_scope text not null default 'all',
  add column creator_ids uuid[] not null default '{}',
  add column creator_access_revision uuid not null default gen_random_uuid(),
  add constraint agency_member_creator_scope_valid check (
    creator_scope in ('all','selected') and cardinality(creator_ids) <= 1000
    and array_position(creator_ids, null) is null
    and (creator_scope = 'selected' or cardinality(creator_ids) = 0)
  );

-- Transfer receipts are private operational state, never a client-facing table.
-- Only the authenticated dashboard route may use the service role to read/write.
create table public.shared_media_transfers (
  id uuid primary key default gen_random_uuid(),
  clone_id uuid not null references public.clones(id) on delete cascade,
  source_kind text not null check (source_kind in ('photo','video')),
  source_id uuid not null,
  account_id text not null check (account_id ~ '^[A-Za-z0-9._:-]{1,64}$'),
  storage_path text not null,
  file_name text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 67108864),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  chunk_sha256 text[] not null,
  file_id uuid not null default gen_random_uuid(),
  connection_revision bigint not null check (connection_revision > 0),
  actor text not null,
  job_id uuid,
  media_id text,
  status text not null default 'prepared',
  processing boolean not null default false,
  received_bytes bigint not null default 0 check (received_bytes >= 0 and received_bytes <= size_bytes),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, source_kind, source_id),
  check (status in ('prepared','receiving','pending','running','complete','failed','interrupted','superseded','expired'))
);
create index shared_media_transfers_creator on public.shared_media_transfers(clone_id, account_id, created_at desc);
alter table public.shared_media_transfers enable row level security;
revoke all on public.shared_media_transfers from public, anon, authenticated;
grant select, insert, update on public.shared_media_transfers to service_role;
comment on table public.shared_media_transfers is 'Dashboard-only receipts linking existing Telegram library files to confirmed OnlyFans vault uploads. No publication or fan delivery.';

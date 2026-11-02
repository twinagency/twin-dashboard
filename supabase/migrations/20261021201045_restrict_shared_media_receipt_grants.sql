-- Supabase default privileges may grant more than this dashboard uses.
revoke all on public.shared_media_transfers from service_role;
grant select, insert, update on public.shared_media_transfers to service_role;

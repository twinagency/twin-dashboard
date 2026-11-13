-- 20260927154552 created these without grants, so a tree applied from this repo
-- alone leaves them executable by anon/authenticated (PUBLIC default plus
-- Supabase default privileges). Server-side callers only.
begin;
revoke all on function public.agency_revenue_clone_user_stats_window(uuid[],timestamptz,timestamptz,uuid),
  public.agency_revenue_messaged_fans(uuid[],timestamptz,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.agency_revenue_clone_user_stats_window(uuid[],timestamptz,timestamptz,uuid),
  public.agency_revenue_messaged_fans(uuid[],timestamptz,timestamptz,uuid) to service_role;
commit;

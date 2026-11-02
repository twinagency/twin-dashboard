-- The SQL-language wrappers used generic plans for an optional creator filter.
-- Keep the exact aggregates and scope checks, but plan these reads for the
-- supplied creator/date range using PL/pgSQL custom plans. No grants change.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.agency_revenue_clone_user_stats_window(p_clones uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_clone uuid DEFAULT NULL::uuid)
 RETURNS TABLE(clone_id uuid, fans bigint, active bigint, messages bigint)
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET plan_cache_mode TO 'force_custom_plan'
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
with u as (
    select
      s.clone_id as cid,
      -- arrivals only, not the cutover import (migration 123)
      count(*) filter (
        where s.legacy_id is null
          and s.first_seen_at >= p_start
          and s.first_seen_at <= p_end
      )::bigint as fans,
      -- messaged in the window, excluding stamps the import carried over from
      -- the old system rather than ones this runtime wrote (see header)
      count(*) filter (
        where s.last_message_received >= p_start
          and s.last_message_received <= p_end
          and not (s.legacy_id is not null and s.last_message_received < s.first_seen_at)
      )::bigint as active
    from users s
    where (s.clone_id = any(p_clones) and (p_clone is null or s.clone_id = p_clone))
    group by s.clone_id
  ),
  m as (
    select
      h.clone_id as cid,
      count(*)::bigint as messages
    from chat_history h
    where h.created_at >= p_start
      and h.created_at <= p_end
      and (h.clone_id = any(p_clones) and (p_clone is null or h.clone_id = p_clone))
    group by h.clone_id
  )
  select
    coalesce(u.cid, m.cid),
    coalesce(u.fans, 0)::bigint,
    coalesce(u.active, 0)::bigint,
    coalesce(m.messages, 0)::bigint
  from u
  full outer join m on m.cid = u.cid
  where coalesce(u.cid, m.cid) is not null;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agency_revenue_messaged_fans(p_clones uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_clone uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET plan_cache_mode TO 'force_custom_plan'
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
select count(distinct h.telegram_id)::bigint
  from chat_history h
  where h.role = 'human'
    and h.created_at >= p_start
    and h.created_at <= p_end
    and (h.clone_id = any(p_clones) and (p_clone is null or h.clone_id = p_clone))
  );
END;
$function$;


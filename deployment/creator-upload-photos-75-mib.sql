-- Increase supported onboarding photos only; preserve video, account, ownership
-- and concurrency checks plus existing service-role-only function permissions.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.claim_creator_upload(uuid,uuid,text,text,text,bigint,text)'::regprocedure) into definition;
  if strpos(definition, 'p_kind like ''%_image'' and p_bytes > 78643200') > 0 then
    return;
  end if;
  if strpos(definition, 'p_kind like ''%_image'' and p_bytes > 15728640') = 0 then
    raise exception 'Unexpected creator photo limit; refusing to alter upload claim function';
  end if;
  execute replace(definition, 'p_kind like ''%_image'' and p_bytes > 15728640', 'p_kind like ''%_image'' and p_bytes > 78643200');
end
$migration$;

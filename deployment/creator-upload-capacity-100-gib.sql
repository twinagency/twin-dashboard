-- Raise only the aggregate allowance; preserve file validation, locking and function privileges.
do $capacity$
declare
  current_definition text;
  updated_definition text;
begin
  select pg_get_functiondef('public.claim_creator_upload(uuid,uuid,text,text,text,bigint,text)'::regprocedure)
    into current_definition;
  if position('used_bytes+reserved_bytes+p_bytes > 107374182400 or' in current_definition) > 0 then
    return;
  end if;
  if position('used_bytes+reserved_bytes+p_bytes > 10737418240 or' in current_definition) = 0 then
    raise exception 'Unexpected upload quota definition; manual review required';
  end if;
  updated_definition := replace(current_definition,
    'used_bytes+reserved_bytes+p_bytes > 10737418240 or',
    'used_bytes+reserved_bytes+p_bytes > 107374182400 or');
  execute updated_definition;
end
$capacity$;

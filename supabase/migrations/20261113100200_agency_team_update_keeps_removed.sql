-- An agency-owner 'update' edits an active member only. It used to set
-- active=true, so the edit form on a Removed row (Twin admin revoke or owner
-- remove) reactivated the member. Reactivation stays with Twin admin.
-- Body is 20261028125157's; the update drops active=true and requires active.
begin;
create or replace function public.agency_team_command(p_actor uuid,p_agency uuid,p_command jsonb)
returns uuid language plpgsql security invoker set search_path = public,pg_temp as $$
declare op text := p_command->>'operation'; target uuid; result_id uuid; ids uuid[]; mode text;
begin
  perform 1 from partner_agencies where id=p_agency and active for update;
  if not found then raise exception 'Agency unavailable'; end if;
  perform 1 from agency_memberships m join agency_team_owners o on o.user_id=m.user_id and o.agency_id=m.agency_id
    where m.user_id=p_actor and m.agency_id=p_agency and m.active and m.creator_scope='all' for update of m,o;
  if not found then raise exception 'Owner access required'; end if;
  if op in ('invite','update') then
    mode := p_command->>'creator_scope';
    select coalesce(array_agg(distinct value::uuid),'{}') into ids from jsonb_array_elements_text(p_command->'creator_ids');
    if mode is null or mode not in ('all','selected') or cardinality(ids)>1000 or (mode='all' and cardinality(ids)>0)
      or exists(select 1 from unnest(ids) i where not exists(select 1 from agency_creators a where a.agency_id=p_agency and a.clone_id=i)) then
      raise exception 'Invalid creator scope';
    end if;
  end if;
  if op='invite' then
    if exists(select 1 from agency_memberships where agency_id=p_agency and lower(email)=lower(p_command->>'email')) then raise exception 'Member already exists'; end if;
    update agency_team_invites set revoked_at=now() where agency_id=p_agency and email=p_command->>'email' and accepted_at is null and revoked_at is null;
    insert into agency_team_invites(agency_id,invited_by,email,token_hash,can_manage,can_chat,creator_scope,creator_ids)
      values(p_agency,p_actor,p_command->>'email',p_command->>'token_hash',(p_command->>'can_manage')::boolean,coalesce((p_command->>'can_chat')::boolean,false),mode,ids) returning id into result_id;
  elsif op='revoke-invite' then
    update agency_team_invites set revoked_at=now() where agency_id=p_agency and id=(p_command->>'id')::uuid and accepted_at is null and revoked_at is null returning id into result_id;
  elsif op in ('update','remove') then
    target := (p_command->>'user_id')::uuid;
    -- Agency owners cannot remove themselves, modify another owner, or create owners.
    if target=p_actor or exists(select 1 from agency_team_owners where user_id=target) then raise exception 'Owner changes require Twin admin'; end if;
    if op='remove' then
      update agency_memberships set active=false,creator_access_revision=gen_random_uuid()
        where user_id=target and agency_id=p_agency and creator_access_revision=(p_command->>'revision')::uuid returning user_id into result_id;
    else
      update agency_memberships set can_manage=(p_command->>'can_manage')::boolean,can_chat=coalesce((p_command->>'can_chat')::boolean,false),creator_scope=mode,creator_ids=ids,creator_access_revision=gen_random_uuid()
        where user_id=target and agency_id=p_agency and active and creator_access_revision=(p_command->>'revision')::uuid returning user_id into result_id;
    end if;
  else raise exception 'Invalid operation'; end if;
  if result_id is null then raise exception 'Record changed'; end if;
  return result_id;
end $$;
revoke all on function public.agency_team_command(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.agency_team_command(uuid,uuid,jsonb) to service_role;
commit;

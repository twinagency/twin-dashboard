/** Flirt may share internal profiles, but another agency's clients stay private. */
export function flirtOnlyFansCreatorIds(
  creators: {id:string; intake?: {onlyfans_connection?: {owner?:unknown}} | null}[],
  assignments: {agency_id:string;clone_id:string}[],
  agencyId:string,
):string[] {
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if(!uuid.test(agencyId)||creators.length>5000||assignments.length>5000||
    creators.some(c=>!uuid.test(c.id))||assignments.some(a=>!uuid.test(a.agency_id)||!uuid.test(a.clone_id)))
    throw new Error("OnlyFans creator ownership could not be verified.");
  const privateIds=new Set(assignments.filter(a=>a.agency_id!==agencyId).map(a=>a.clone_id.toLowerCase()));
  return [...new Set(creators.filter(c=>{
    const owner=c.intake?.onlyfans_connection?.owner;
    return !privateIds.has(c.id.toLowerCase())&&
      !(typeof owner==="string"&&owner.startsWith("agency:")&&owner!=="agency:"+agencyId);
  }).map(c=>c.id.toLowerCase()))].sort();
}

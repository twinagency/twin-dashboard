// Identity is built from verified creator-account and agency-assignment rows.
// Portal hints, hostnames and user metadata must never select intake permissions.
type CreatorIntakeIdentity = { name?: string | null; agencyId?: string | null };
const MOXY_AGENCY_ID = "bc670215-110b-4ea0-8f5c-af3dfe21d253";
export function creatorIntakeOptional(creator: CreatorIntakeIdentity): boolean {
  return (creator.agencyId === null && creator.name === "Twin")
    || (creator.agencyId === MOXY_AGENCY_ID && /^moxy(?:\\s+management)?$/i.test(creator.name || ""));
}

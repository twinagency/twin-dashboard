export const creatorUuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export type StaffCreatorScope = { creator_scope: "all" | "selected"; creator_ids: string[]; creator_access_revision: string };

/** Intersect on every request: removing an agency assignment immediately removes
 * staff access too. Invalid or unavailable permission data never grants access. */
export function staffCreatorIds(agencyIds: string[], value: unknown): string[] | null {
  if (!value || typeof value !== "object") return null;
  const scope = value as StaffCreatorScope;
  if (!["all", "selected"].includes(scope.creator_scope) || !Array.isArray(scope.creator_ids)
    || scope.creator_ids.length > 1000 || scope.creator_ids.some(id => !creatorUuid(id))
    || !creatorUuid(scope.creator_access_revision) || scope.creator_scope === "all" && scope.creator_ids.length) return null;
  const selected = new Set(scope.creator_ids.map(id => id.toLowerCase()));
  return [...new Set(agencyIds.map(id => id.toLowerCase()))].filter(id => scope.creator_scope === "all" || selected.has(id)).sort();
}

export function parseStaffCreatorCommand(fd: FormData) {
  const keys = ["agency", "user_id", "expected_revision", "creator_scope", "creator_ids"];
  if ([...fd.keys()].some(key => !keys.includes(key))) return null;
  for (const key of keys.filter(key => key !== "creator_ids")) if (fd.getAll(key).length !== 1) return null;
  const agencyId = fd.get("agency"), userId = fd.get("user_id"), expectedRevision = fd.get("expected_revision"), mode = fd.get("creator_scope");
  const values = fd.getAll("creator_ids");
  if (!creatorUuid(agencyId) || !creatorUuid(userId) || !creatorUuid(expectedRevision) || !["all", "selected"].includes(String(mode))
    || values.length > 1000 || values.some(id => !creatorUuid(id))) return null;
  return { agencyId, userId, expectedRevision, mode: mode as "all" | "selected", creatorIds: mode === "all" ? [] : [...new Set(values as string[])].map(id => id.toLowerCase()).sort() };
}

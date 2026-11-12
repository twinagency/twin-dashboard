// Clone lookup by NAME, shared by every "uuid, slug or name" resolver (admin
// API resolveClone, the assistant's read + write tools, scripts/issue-api-key).
// No imports, so scripts and the assistant can use it without the
// api-read <-> ai-assistant/tools import cycle or server-only.
//
// Exact, case-insensitive: LIKE wildcards (`\`, `%`, `_`) are escaped, `*`
// (PostgREST's alias for `%`, which has no escape) never matches, and two hits
// is no hit. Several of these resolvers pick the target of a WRITE, so
// "Other%" must not resolve to "Other Clone". A read error throws: null means
// "no such clone", and an outage must not read as one.
type Rows<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function findCloneByName<T>(
  name: string,
  ilikeName: (pattern: string) => { limit(n: number): Rows<T> },
): Promise<T | null> {
  if (name.includes("*")) return null;
  const { data, error } = await ilikeName(name.replace(/[\\%_]/g, "\\$&")).limit(2);
  if (error) throw new Error(`clone lookup failed: ${error.message}`);
  return data?.length === 1 ? data[0] : null;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

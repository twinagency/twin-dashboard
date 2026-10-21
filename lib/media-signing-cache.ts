import { accessCacheKey, getDashboardAccess } from "./dashboard-access";
import { supabaseAdmin } from "./supabase";

type Signed = Awaited<ReturnType<ReturnType<typeof supabaseAdmin.storage.from>["createSignedUrls"]>>;
const cache = new Map<string, { until: number; result: Promise<Signed> }>();

/** Hard expiry, never stale-while-revalidate: cached URLs remain valid for at
 * least 55 minutes. Current identity and roster are resolved before every hit. */
export async function signDashboardMedia(paths: string[]): Promise<Signed> {
  const access = await getDashboardAccess();
  const key = JSON.stringify([accessCacheKey(access), paths]);
  for (const [id, entry] of cache) if (entry.until <= Date.now()) cache.delete(id);
  const hit = cache.get(key);
  if (hit) return hit.result;
  const result = supabaseAdmin.storage.from("media").createSignedUrls(paths, 3600);
  const entry = { until: Date.now() + 300_000, result };
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  cache.set(key, entry);
  void result.then(value => {
    if ((value.error || value.data?.some(item => !item.signedUrl)) && cache.get(key) === entry) cache.delete(key);
  }, () => { if (cache.get(key) === entry) cache.delete(key); });
  return result;
}
export function clearMediaSigningCache() { cache.clear(); }

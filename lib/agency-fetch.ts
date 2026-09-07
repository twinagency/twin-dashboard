import { getDashboardAccess } from "./dashboard-access";
import { AGENCY_ROLLUPS, scopeReadUrl, redactAgencyData } from "./agency-query";
import { serviceClient } from "./supabase-service";
import { profileImagePathForClone } from "./colors";
import type { AgencyIdentity } from "./agency-identity";
function denied(message = "Read-only agency access") {
  return new Response(JSON.stringify({message,code:"42501"}),{status:403,headers:{"content-type":"application/json"}});
}
async function ownsMedia(agency: AgencyIdentity, paths: string[]): Promise<boolean> {
  if (!paths.length || paths.length > 1000 || !agency.cloneIds.length) return false;
  if (paths.some(p=>!p || p.includes("..") || p.startsWith("/") || p.includes("\\"))) return false;
  const db = serviceClient();
  const [photos,videos,bundles,clones] = await Promise.all([
    db.from("photos").select("storage_path").in("clone_id",agency.cloneIds).in("storage_path",paths),
    db.from("videos").select("storage_path").in("clone_id",agency.cloneIds).in("storage_path",paths),
    db.from("photo_bundles").select("photo_bundle_items(storage_path)").in("clone_id",agency.cloneIds),
    db.from("clones").select("intake").in("id",agency.cloneIds),
  ]);
  if ([photos,videos,bundles,clones].some(r=>r.error)) return false;
  const owned = new Set([
    ...(photos.data??[]).map(p=>p.storage_path), ...(videos.data??[]).map(p=>p.storage_path),
    ...(bundles.data??[]).flatMap(b=>b.photo_bundle_items.map(p=>p.storage_path)),
    ...(clones.data??[]).map(c=>profileImagePathForClone(c.intake)),
  ]);
  return paths.every(p=>owned.has(p));
}
export async function dashboardFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const agency = await getDashboardAccess();
  if (!agency) return fetch(input,init);
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const jsonBody = () => JSON.parse(String(init?.body ?? "{}"));
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const fn = url.pathname.split("/").pop()!;
    if (method !== "POST" || !AGENCY_ROLLUPS.has(fn)) return denied();
    const args = jsonBody();
    if (args.p_clone && !agency.cloneIds.includes(args.p_clone)) return denied("Creator access denied");
    url.pathname = url.pathname.replace(`/rpc/${fn}`,`/rpc/agency_${fn}`);
    return fetch(url,{...init,cache:"no-store",body:JSON.stringify({...args,p_clones:agency.cloneIds})});
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    if (!["GET","HEAD"].includes(method)) return denied();
    let scoped;
    try { scoped = scopeReadUrl(url,agency); } catch { return denied("This data is restricted to administrators"); }
    const res = await fetch(scoped.url,{...init,cache:"no-store"});
    if (!res.ok || method === "HEAD") return res;
    const data = redactAgencyData(await res.json());
    const headers = new Headers(res.headers);headers.delete("content-length");headers.delete("content-encoding");
    return new Response(JSON.stringify(data),{status:res.status,headers});
  }
  if (url.pathname.startsWith("/storage/v1/object/sign/media") && method === "POST") {
    const prefix = "/storage/v1/object/sign/media";
    const paths = url.pathname === prefix ? jsonBody().paths : [decodeURIComponent(url.pathname.slice(prefix.length+1))];
    if (!Array.isArray(paths) || !await ownsMedia(agency,paths)) return denied("Media access denied");
    return fetch(url,{...init,cache:"no-store"});
  }
  return denied();
}

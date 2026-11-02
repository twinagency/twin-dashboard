import { isAgencySequenceTable, scopeSequenceRead, scopeSequenceWrite, sequenceVideoSelection, scopeSequenceVideoFamily } from "./agency-sequence";
import { agencyCanManage } from "./agency-management-policy";
import { assignedStoragePath } from "./agency-management";
import { scopeAgencyWrite, scopeBundleItems } from "./agency-write";
import { getDashboardAccess } from "./dashboard-access";
import { AGENCY_ROLLUPS, scopeReadUrl, redactAgencyData } from "./agency-query";
import { isMappedRollup, scaleRpcBody, scaleTableBody } from "./agency-scale";
import { getViewerTermsFor } from "./platform-cut";
import { serviceClient } from "./supabase-service";
import { profileImagePathForClone } from "./colors";
import type { AgencyIdentity } from "./agency-identity";
import { creatorStorageFetch } from "./creator-storage-fetch";
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
  if (!agency) return creatorStorageFetch(input,init);
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const jsonBody = async () => {
    if (typeof init?.body === "string") return JSON.parse(init.body);
    if (input instanceof Request && init?.body == null) return input.clone().json();
    return {};
  };
  // Earned stars are scaled to this viewer's NET here, at the source. If the
  // terms cannot be resolved this throws and the catch below refuses: never gross.
  const safeResponse = async (res: Response, table: string) => {
    if (!res.ok || method === "HEAD" || res.status === 204) return res;
    const text=await res.text();
    const mult=(await getViewerTermsFor(agency)).starMult;
    const safeHeaders=new Headers(res.headers);safeHeaders.delete("content-length");safeHeaders.delete("content-encoding");
    return new Response(text ? JSON.stringify(scaleTableBody(table,redactAgencyData(JSON.parse(text)),mult)) : null,{status:res.status,headers:safeHeaders});
  };
  try {
    // This service-key client only admits the public schema, never a caller-selected profile.
    if ([headers.get("content-profile"),headers.get("accept-profile")].some(p=>p && p!=="public")) return denied();
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.split("/").pop()!;
      if (method !== "POST" || !AGENCY_ROLLUPS.has(fn) || !isMappedRollup(fn)) return denied();
      const args = await jsonBody();
      if (args.p_clone && !agency.cloneIds.includes(args.p_clone)) return denied("Creator access denied");
      url.pathname = url.pathname.replace(`/rpc/${fn}`,`/rpc/agency_${fn}`);
      const mult=(await getViewerTermsFor(agency)).starMult;
      const res=await fetch(url,{...init,cache:"no-store",body:JSON.stringify({...args,p_clones:agency.cloneIds})});
      if (!res.ok || res.status===204) return res;
      const text=await res.text();
      const rpcHeaders=new Headers(res.headers);rpcHeaders.delete("content-length");rpcHeaders.delete("content-encoding");
      return new Response(text ? JSON.stringify(scaleRpcBody(fn,JSON.parse(text),mult)) : null,{status:res.status,headers:rpcHeaders});
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      let scoped: URL;
      const table = url.pathname.split("/").pop()!;
      if (["GET","HEAD"].includes(method)) {
        scoped = isAgencySequenceTable(table)
          ? await scopeSequenceRead(url, agency)
          : table === "videos" && (url.searchParams.get("select") || "").split(",").some(field => field.trim() === "content_family_id")
            ? sequenceVideoSelection(url, agency)
            : agencyCanManage(agency) && url.pathname === "/rest/v1/photo_bundle_items"
              ? await scopeBundleItems(url,agency)
              : scopeReadUrl(url,agency).url;
      } else {
        if (headers.get("prefer")?.includes("resolution=")) return denied("Agency upserts are not allowed");
        const body = await jsonBody();
        scoped = isAgencySequenceTable(table)
          ? await scopeSequenceWrite(url, method, body, agency)
          : table === "videos" && method === "PATCH" && body && Object.hasOwn(body, "content_family_id")
            ? await scopeSequenceVideoFamily(url, body, agency)
            : await scopeAgencyWrite(url,method,body,agency);
      }
      return await safeResponse(await fetch(scoped,{...init,cache:"no-store"}),table);
    }
    if (url.pathname.startsWith("/storage/v1/object/sign/media") && method === "POST") {
      const prefix = "/storage/v1/object/sign/media";
      const paths = url.pathname === prefix ? (await jsonBody()).paths : [decodeURIComponent(url.pathname.slice(prefix.length+1))];
      if (!Array.isArray(paths) || !await ownsMedia(agency,paths)) return denied("Media access denied");
      return fetch(url,{...init,cache:"no-store"});
    }
    if (agencyCanManage(agency)) {
      const prefix="/storage/v1/object/media";
      if (url.pathname.startsWith(prefix+"/") && ["POST","GET"].includes(method)) {
        assignedStoragePath(agency,decodeURIComponent(url.pathname.slice(prefix.length+1)));
        if (headers.get("x-upsert")==="true") return denied("Agency storage replacement is not allowed");
        return fetch(url,{...init,cache:"no-store"});
      }
      if (url.pathname===prefix && method==="DELETE") {
        const paths=(await jsonBody()).prefixes;
        if (!Array.isArray(paths) || !paths.length || paths.length>1000) return denied("Invalid media selection");
        paths.forEach(path=>assignedStoragePath(agency,path));
        return fetch(url,{...init,cache:"no-store"});
      }
    }
  } catch { return denied("Agency permission or resource validation failed"); }
  return denied();
}


import { object, connectionOwner } from "@/lib/onlyfans-connections/contract";

export type BrowserSession = {ownerId: number; expiresAt: string; browser: {
  schemaVersion: "of-browser.v1"; headers: {user_id: string; user_agent: string; x_bc: string; x_of_rev: string; x_hash: string | null};
  cookies: {name: string; value: string; domain: string; path: string}[]; staticParam: string;
  samples: {url: string; sign: string; time: string}[];
}};
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).sort().join(",") === expected.sort().join(",");
const header = (v: unknown, max = 4096): v is string => typeof v === "string" && v.length <= max && /^[\x20-\x7e]+$/.test(v);
export function validBrowserSession(value: unknown): value is BrowserSession {
  if (!object(value) || !keys(value,["ownerId","expiresAt","browser"]) || !Number.isSafeInteger(value.ownerId) || Number(value.ownerId) <= 0 ||
      typeof value.expiresAt !== "string" || !/(?:Z|[+-]\d\d:\d\d)$/.test(value.expiresAt) || !(Date.parse(value.expiresAt) > Date.now()) || Date.parse(value.expiresAt) > Date.now() + 86400000) return false;
  const b = value.browser;
  if (!object(b) || !keys(b,["schemaVersion","headers","cookies","staticParam","samples"]) || b.schemaVersion !== "of-browser.v1" || !header(b.staticParam) || !object(b.headers)) return false;
  const h = b.headers;
  if (!keys(h,["user_id","user_agent","x_bc","x_of_rev","x_hash"]) || typeof h.user_id !== "string" || connectionOwner(h.user_id) !== value.ownerId ||
      !header(h.user_agent) || !header(h.x_bc) || typeof h.x_of_rev !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(h.x_of_rev) || !(h.x_hash === null || header(h.x_hash))) return false;
  if (!Array.isArray(b.cookies) || !b.cookies.length || b.cookies.length > 64 || !Array.isArray(b.samples) || b.samples.length < 2 || b.samples.length > 4) return false;
  const names = new Set<string>(); let size = 0;
  for (const c of b.cookies) {
    if (!object(c) || !keys(c,["name","value","domain","path"]) || typeof c.name !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(c.name) || names.has(c.name) ||
        !header(c.value,8192) || /[;,"\\\s]/.test(c.value) || !["onlyfans.com",".onlyfans.com"].includes(String(c.domain)) || c.path !== "/") return false;
    names.add(c.name); size += c.name.length + c.value.length + 3;
  }
  if (size > 16386 || b.cookies.find(c => c.name === "auth_id")?.value !== h.user_id) return false;
  const seen = new Set<string>(), prefixes = new Set<string>();
  for (const s of b.samples) {
    if (!object(s) || !keys(s,["url","sign","time"]) || !header(s.url,2048) || !header(s.sign) || typeof s.time !== "string" || !/^\d{13}$/.test(s.time) ||
        Date.now() - Number(s.time) > 900000 || Number(s.time) - Date.now() > 60000) return false;
    try { const u = new URL(s.url); if (u.origin !== "https://onlyfans.com" || u.username || u.password || u.hash || !u.pathname.startsWith("/api2/v2/") || s.url.includes("\\") || new URL(s.url).pathname.split("/").includes("..")) return false; } catch { return false; }
    const parts = s.sign.split(":");
    if (parts.length !== 4 || !parts[0] || !parts[3] || !/^[a-f0-9]{40}$/.test(parts[1]) || !/^[a-f0-9]{1,8}$/.test(parts[2]) || seen.has(parts[1])) return false;
    seen.add(parts[1]); prefixes.add(parts[0]+":"+parts[3]);
  }
  return prefixes.size === 1 && new TextEncoder().encode(JSON.stringify(b)).length <= 98304;
}

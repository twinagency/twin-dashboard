import { AGENCY_COLUMNS } from "./agency-columns";
import { isMoxy, MOXY_PRIVATE_MODEL_COLUMNS } from "./agency-brand";
import type { AgencyIdentity } from "./agency-identity";
export const AGENCY_ROLLUPS = new Set([
  "revenue_usage_rollup", "revenue_clone_user_stats", "revenue_clone_user_stats_window",
  "revenue_fan_spend_stats", "revenue_fan_tiers", "revenue_messaged_fans",
  "revenue_conversation_funnel", "revenue_paywall_stats", "revenue_active_chat_buyers", "revenue_all_time_stars",
]);
const GLOBAL_COLUMNS: Record<string, readonly string[]> = {
  twin_versions: ["id", "version", "name", "summary", "body", "changes", "created_at", "released_at"],
};
export function scopedSelection(table: string, selection: string, hideModels = false): string {
  const source = AGENCY_COLUMNS[table] ?? GLOBAL_COLUMNS[table];
  const allowed = hideModels && table === "clones" ? source?.filter(field => !MOXY_PRIVATE_MODEL_COLUMNS.has(field)) : source;
  if (!allowed) throw new Error("This data is restricted to administrators");
  // Split top-level fields; the only related rows admitted are bundle children.
  const parts = selection.match(/[^,()]+\([^()]*\)|[^,()]+/g) ?? [];
  if (parts.join(",").replace(/\s/g, "") !== selection.replace(/\s/g, "")) throw new Error("Unsupported related data");
  const output: string[] = [];
  for (const raw of parts) {
    const field = raw.trim();
    if (field === "*") output.push(...allowed);
    else if (table === "photo_bundles" && /^photo_bundle_items\([^()]*\)$/.test(field)) {
      output.push(`photo_bundle_items(${scopedSelection("photo_bundle_items",field.slice(19,-1))})`);
    } else if (allowed.includes(field)) output.push(field);
    else if (table === "clones" && (field === "bot_token" || (hideModels && MOXY_PRIVATE_MODEL_COLUMNS.has(field)))) continue;
    else throw new Error("Unsupported agency column");
  }
  return [...new Set(output)].join(",") || "id";
}
export function scopeReadUrl(input: URL, agency: AgencyIdentity): {url: URL; table: string} {
  const url = new URL(input);
  const table = url.pathname.split("/").pop()!;
  if (!/^[a-z_]+$/.test(table)) throw new Error("Unsupported agency resource");
  url.searchParams.set("select",scopedSelection(table,url.searchParams.get("select") || "*", isMoxy(agency.name)));
  if (GLOBAL_COLUMNS[table]) return {url,table};
  if (table === "photo_bundle_items") throw new Error("Read bundle items through their assigned bundle");
  const owner = table === "clones" ? "id" : "clone_id";
  const ids = agency.cloneIds.length ? agency.cloneIds : ["00000000-0000-0000-0000-000000000000"];
  if (ids.some(id=>!/^[0-9a-f-]{36}$/i.test(id))) throw new Error("Invalid agency assignment");
  // Append a mandatory AND, never replace a caller filter or accept its scope.
  url.searchParams.append("and",`(${owner}.in.(${ids.join(",")}))`);
  return {url,table};
}
export function redactAgencyData(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g,"[redacted]");
  if (Array.isArray(value)) return value.map(redactAgencyData);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key,v])=>[
    key, /^(bot_token|api_key|service_key|secret|password|authorization|access_token|refresh_token)$/i.test(key) ? null : redactAgencyData(v),
  ]));
  return value;
}

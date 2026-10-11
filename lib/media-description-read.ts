// Older independent FLIRT databases do not have visual_description yet.
// Retry only a missing-column read, retaining the already validated URL,
// creator filters, headers and method. Never substitute another description.
export async function fetchMediaDescription(
  url: URL,
  init: RequestInit | undefined,
  send: typeof fetch = fetch,
): Promise<Response> {
  const response = await send(url, init);
  if (response.ok || (init?.method ?? "GET").toUpperCase() !== "GET") return response;
  if (!["photos", "videos", "photo_bundles", "photo_bundle_items"].includes(url.pathname.split("/").pop() ?? "")) return response;
  const selection = url.searchParams.get("select") ?? "";
  if (!/(^|[,(])visual_description(?=,|\)|$)/.test(selection)) return response;
  const error = await response.clone().json().catch(() => null);
  const missing = error?.code === "42703" && /visual_description.*does not exist/i.test(error.message ?? "")
    || error?.code === "PGRST204" && /visual_description/.test(error.message ?? "");
  if (!missing) return response;
  const retry = new URL(url);
  const compatible = selection
    .replace(/(^|[,(])visual_description(?=,|\)|$)/g, "$1")
    .replace(/\(,/g, "(")
    .replace(/,,/g, ",")
    .replace(/,\)/g, ")")
    .replace(/^,|,$/g, "")
    .replace(/\(\)/g, "(id)");
  retry.searchParams.set("select", compatible || "id");
  return send(retry, init);
}

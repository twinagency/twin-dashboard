/** Server-only transport to the launch backend contract. The credential never reaches the browser. */
import { LAUNCH_HEADER, LAUNCH_SCHEMA } from "./a-types";

export type LaunchBackendResult = { ok: true; data: unknown } | { ok: false; status: number; error: string; outcome: "refused" | "unconfirmed" | "unavailable" };
export type LaunchBackend = {
  read(accountId: string, path: string, query: Record<string, string>): Promise<LaunchBackendResult>;
  command(accountId: string, path: string, body: unknown): Promise<LaunchBackendResult>;
};
const clean = (u: string) => u.replace(/\/+$/, "");

export function createLaunchBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }): LaunchBackend {
  const f = options.fetchImpl ?? fetch;
  const url = (accountId: string, path: string) => `${clean(options.baseUrl)}/onlyfans/launch/v1/accounts/${encodeURIComponent(accountId)}/${path}`;
  const headers = { Authorization: `Bearer ${options.token}`, [LAUNCH_HEADER]: LAUNCH_SCHEMA };
  const send = (u: string, init: RequestInit) => f(u, { ...init, credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  return {
    async read(accountId, path, query) {
      const q = new URLSearchParams(query).toString();
      try {
        const r = await send(url(accountId, path) + (q ? `?${q}` : ""), { method: "GET", headers });
        if (r.ok) { const j = await r.json(); if (j && j.schemaVersion === LAUNCH_SCHEMA && j.ok === true && j.accountId === accountId) return { ok: true, data: j.data }; }
        // 404/501 means this backend does not have the contract yet.
        return { ok: false, status: [404, 501].includes(r.status) ? 503 : r.status === 401 || r.status === 403 ? 403 : 502, outcome: [404, 501, 503].includes(r.status) ? "unavailable" : "refused",
          error: [404, 501, 503].includes(r.status) ? "The backend contract for this screen is not available yet." : "The backend refused or returned an unreadable answer." };
      } catch { return { ok: false, status: 503, outcome: "unavailable", error: "The backend could not be reached." }; }
    },
    async command(accountId, path, body) {
      try {
        const r = await send(url(accountId, path), { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (r.ok) { const j = await r.json(); if (j && j.schemaVersion === LAUNCH_SCHEMA && j.ok === true && j.accountId === accountId && j.applied === true) return { ok: true, data: j.data ?? null }; }
        else if ([400, 401, 403, 404, 409, 413, 422].includes(r.status)) return { ok: false, status: r.status === 409 ? 409 : r.status === 404 ? 404 : r.status, outcome: "refused",
          error: r.status === 409 ? "This changed since you loaded it. Refresh and review before trying again." : "The change was not accepted." };
        else if (r.status === 501 || r.status === 503) return { ok: false, status: 503, outcome: "unavailable", error: "The backend contract for this change is not available yet." };
      } catch { /* A lost reply does not prove the change failed. */ }
      return { ok: false, status: 502, outcome: "unconfirmed", error: "The outcome is not confirmed. Refresh, then retry the same request if it did not apply." };
    },
  };
}
export function configuredLaunchBackend(fetchImpl?: typeof fetch): LaunchBackend | null {
  const baseUrl = (process.env.ONLYFANS_API_BASE_URL ?? "").trim(), token = (process.env.ONLYFANS_LAUNCH_TOKEN ?? "").trim();
  if (!baseUrl || token.length < 16) return null;
  // The launch credential must be its own; reuse of another purpose's token is refused.
  for (const p of ["API", "CONTROL", "CONFIGURATION", "CAMPAIGN", "CONTENT", "CONNECTION"]) if ((process.env[`ONLYFANS_${p}_TOKEN`] ?? "").trim() === token) return null;
  try { const u = new URL(baseUrl); if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || u.search || u.hash) return null; } catch { return null; }
  return createLaunchBackend({ baseUrl, token, fetchImpl });
}

import { CAMPAIGN_HEADER, CAMPAIGN_SCHEMA, parseCampaignAck, parseCampaignDetail, parseCampaignList,
  type CampaignCreate, type CampaignChange, type CampaignFailure } from "./campaigns";

export function createCampaignBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = options.fetchImpl ?? fetch;
  const url = (account: string, id?: string) => options.baseUrl.replace(/\/+$/, "") + `/onlyfans/campaign/v1/accounts/${encodeURIComponent(account)}/campaigns${id ? `/${encodeURIComponent(id)}` : ""}`;
  const headers = { Authorization: `Bearer ${options.token}`, [CAMPAIGN_HEADER]: CAMPAIGN_SCHEMA };
  async function get<T>(account: string, id: string | undefined, parse: (value: unknown) => T | null) {
    try {
      const response = await call(url(account, id), { method: "GET", credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8_000), headers });
      if (response.ok) { const data = parse(await response.json()); if (data) return { ok: true as const, data }; }
      return { ok: false as const, status: [401, 403, 404].includes(response.status) ? response.status : 503, error: "Campaigns could not be read." };
    } catch { return { ok: false as const, status: 503, error: "Campaigns could not be read." }; }
  }
  async function post(accountId: string, id: string | undefined, command: Record<string, unknown>, expected: Parameters<typeof parseCampaignAck>[1]) {
    try {
      const response = await call(url(accountId, id) + (expected.action ? "/actions" : ""), { method: "POST", credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
        headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(command) });
      if ([400, 401, 403, 404, 409, 413, 503].includes(response.status)) return { ok: false, status: response.status, outcome: "refused", error: response.status === 409
        ? "The campaign changed or an account hold prevents this action. Refresh and review it."
        : "The campaign request was not accepted. Review the account, audience and message." } as CampaignFailure;
      if (response.ok) { const ack = parseCampaignAck(await response.json(), expected); if (ack) return { ok: true as const, ack }; }
    } catch { /* A missing acknowledgement cannot establish that the write failed. */ }
    return { ok: false, status: 502, outcome: "unconfirmed", error: "The outcome is not confirmed. Retry the same request or refresh the campaign." } as CampaignFailure;
  }
  return {
    list: (account: string) => get(account, undefined, value => parseCampaignList(value, account)),
    detail: (account: string, id: string) => get(account, id, value => parseCampaignDetail(value, account, id)),
    create: (accountId: string, input: Omit<CampaignCreate, "requestKey"> & { actor: string; commandKey: string }) => post(accountId, undefined, input, { accountId, commandKey: input.commandKey }),
    change: (accountId: string, id: string, input: CampaignChange & { actor: string; commandKey: string }) => post(accountId, id, input, { accountId, campaignId: id, commandKey: input.commandKey, action: input.action, expectedRevision: input.expectedRevision }),
  };
}
export function configuredCampaignBackend() {
  const baseUrl = (process.env.ONLYFANS_API_BASE_URL ?? "").trim();
  const token = (process.env.ONLYFANS_CAMPAIGN_TOKEN ?? "").trim();
  if (!baseUrl || !token || [process.env.ONLYFANS_API_TOKEN, process.env.ONLYFANS_CONTROL_TOKEN, process.env.ONLYFANS_CONFIGURATION_TOKEN,
    process.env.ONLYFANS_CONTENT_TOKEN, process.env.ONLYFANS_CONNECTION_TOKEN].some(value => value?.trim() === token)) return null;
  try { const parsed = new URL(baseUrl); if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return null; }
  catch { return null; }
  return createCampaignBackend({ baseUrl, token });
}

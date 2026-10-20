import { createBackendTransport, configuredBackendPurpose } from "./backend-transport";
import { CAMPAIGN_HEADER, CAMPAIGN_SCHEMA, parseCampaignAck, parseCampaignDetail, parseCampaignList,
  type CampaignCreate, type CampaignChange, type CampaignFailure } from "./campaigns";

export function createCampaignBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  const url = (account: string, id?: string) => options.baseUrl.replace(/\/+$/, "") + `/onlyfans/campaign/v1/accounts/${encodeURIComponent(account)}/campaigns${id ? `/${encodeURIComponent(id)}` : ""}`;
  const headers = { Authorization: `Bearer ${options.token}`, [CAMPAIGN_HEADER]: CAMPAIGN_SCHEMA };
  async function get<T>(account: string, id: string | undefined, parse: (value: unknown) => T | null) {
    try {
      const response = await call(url(account, id), { method: "GET", headers });
      if (response.ok) { const data = parse(await response.json()); if (data) return { ok: true as const, data }; }
      return { ok: false as const, status: [401, 403, 404].includes(response.status) ? response.status : 503, error: "Campaigns could not be read." };
    } catch { return { ok: false as const, status: 503, error: "Campaigns could not be read." }; }
  }
  async function post(accountId: string, id: string | undefined, command: Record<string, unknown>, expected: Parameters<typeof parseCampaignAck>[1]) {
    try {
      const response = await call(url(accountId, id) + (expected.action ? "/actions" : ""), { method: "POST", timeoutMs: 12_000, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(command) });
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
export function configuredCampaignBackend(fetchImpl?: typeof fetch) {
  const options = configuredBackendPurpose("CAMPAIGN");
  return options ? createCampaignBackend({ ...options, fetchImpl }) : null;
}

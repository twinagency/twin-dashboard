import { createBackendTransport, configuredBackendPurpose } from "@/lib/onlyfans/backend-transport";
import { CONNECTION_HEADER, CONNECTION_SCHEMA, parseConnection, parseConnectionAck, parseRegistrationAck,
  parseEnrollment, type ConnectionEnrollmentRequest, type ConnectionRequest, type ConnectionRegistration, type ConnectionFailure } from "./contract";
type Identity = { actor: string; commandKey: string };
export function createConnectionBackend(options: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const call = createBackendTransport(options.fetchImpl);
  const root = options.baseUrl.replace(/\/+$/, "") + "/onlyfans/connection/v1";
  const base = root + "/accounts";
  const headers = { Authorization: `Bearer ${options.token}`, [CONNECTION_HEADER]: CONNECTION_SCHEMA };
  async function post(path: string, body: unknown) {
    try {
      const response = await call(path, { method: "POST", timeoutMs: 15_000, headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.status === 503) {
        const body = await response.clone().json().catch(() => null);
        if (body?.code === "proxy_unavailable") return { ok: false, status: 503, outcome: "refused",
          error: "No fixed proxy is available for this creator. Ask your administrator to add proxy capacity." } as ConnectionFailure;
      }
      if ([400, 401, 403, 404, 409, 413, 503].includes(response.status)) return { ok: false, status: response.status, outcome: "refused",
        error: response.status === 409 ? "The connection command was refused. Review the refreshed account and entered values." : "The account connection change was refused." } as ConnectionFailure;
      if (response.ok) return { ok: true as const, body: await response.json() as unknown };
    } catch { /* Write outcome remains unknown; no automatic retry. */ }
    return { ok: false, status: 502, outcome: "unconfirmed", error: "The connection outcome is not confirmed. Refresh or retry the same request." } as ConnectionFailure;
  }
  return {
    async captureContext(creatorId:string,accountId:string|null,assignProxy=false) {
      const result=await post(root+'/capture-context',{creatorId,accountId,...(assignProxy?{assignProxy:true}:{})});
      if(!result.ok)return result;
      const body=result.body as {ok?:boolean;context?:import('@/lib/onlyfans-sign-in/backend').SignInNetwork};
      const data=body?.ok===true?body.context:null;
      if(data&&data.accountId===accountId&&(data.ownerId===null||Number.isSafeInteger(data.ownerId)&&data.ownerId>0)&&(data.proxyUrl===null||typeof data.proxyUrl==='string'&&/^[\x20-\x7e]{1,4096}$/.test(data.proxyUrl))&&/^[a-f0-9]{64}$/.test(data.fingerprint))return {ok:true as const,data};
      return {ok:false as const,status:503,error:'Your login connection could not be prepared.'};
    },
    async enroll(command: ConnectionEnrollmentRequest & Identity) {
      const result=await post(root+"/enrollments",command);if(!result.ok)return result;
      const body=result.body as {ok?:boolean;enrollment?:unknown},data=body?.ok===true?parseEnrollment(body.enrollment):null;
      return data?{ok:true as const,data}:{ok:false as const,status:502,error:"Your connection request could not be confirmed. Refresh before retrying."};
    },
    async enrollments(creatorId:string) {
      try {
        const response=await call(root+"/enrollments?creator="+encodeURIComponent(creatorId),{method:"GET",headers});
        const body=response.ok?await response.json() as {ok?:boolean;enrollments?:unknown[]}:null;
        const rows=body?.ok===true&&Array.isArray(body.enrollments)?body.enrollments.map(parseEnrollment):null;
        if(rows&&rows.length<=5&&rows.every(row=>row!==null))return {ok:true as const,data:rows};
      }catch{}
      return {ok:false as const,status:503,error:"Connection requests could not be loaded."};
    },
    async get(accountId: string) {
      try {
        const response = await call(base + "/" + encodeURIComponent(accountId) + "?progress=1&runner=1&policy=1", { method: "GET", headers });
        if (response.ok) { const data = parseConnection(await response.json(), accountId); if (data) return { ok: true as const, data }; }
        return { ok: false as const, status: response.status === 404 ? 404 : 503, error: "The recorded account connection could not be read." };
      } catch { return { ok: false as const, status: 503, error: "The recorded account connection could not be read." }; }
    },
    async command(accountId: string, command: ConnectionRequest & Identity) {
      const result = await post(base + "/" + encodeURIComponent(accountId), command);
      if (!result.ok) return result;
      const ack = parseConnectionAck(result.body, { ...command, accountId });
      return ack ? { ok: true as const, ack } : { ok: false, status: 502, outcome: "unconfirmed", error: "The connection outcome is not confirmed. Refresh or retry the same request." } as ConnectionFailure;
    },
    async provision(command: ConnectionRegistration & Identity & { creatorName: string }) {
      const result = await post(base, command); if (!result.ok) return result;
      const ack = parseRegistrationAck(result.body, command);
      return ack ? { ok: true as const, ack } : { ok: false, status: 502, outcome: "unconfirmed", error: "The account registration outcome is not confirmed. Retry the same request." } as ConnectionFailure;
    },
  };
}
export function configuredConnectionBackend() {
  const options = configuredBackendPurpose("CONNECTION");
  return options ? createConnectionBackend(options) : null;
}

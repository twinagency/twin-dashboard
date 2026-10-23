import { bFetch, type BReply } from "../b-common";
import { parseFanReply, parseRecoveryReply, type Correction, type FanReply, type Recovery } from "./b-memory";

const enc = encodeURIComponent;
const base = (accountId: string) => `/api/onlyfans-launch/memory/accounts/${enc(accountId)}`;
function shaped<T>(reply: BReply<unknown>, parse: (v: unknown) => T | null): BReply<T> {
  if (reply.kind !== "ok") return reply as BReply<T>;
  const parsed = parse(reply.data);
  return parsed ? { kind: "ok", data: parsed } : { kind: "unavailable", error: "The response was not in the expected shape, so nothing is shown." };
}
export const readRecovery = async (accountId: string, signal?: AbortSignal): Promise<BReply<Recovery>> =>
  shaped(await bFetch(`${base(accountId)}/fans`, { signal }), v => parseRecoveryReply(v, accountId));
export const readFan = async (accountId: string, fanId: string, signal?: AbortSignal): Promise<BReply<FanReply>> =>
  shaped(await bFetch(`${base(accountId)}/fans/${enc(fanId)}`, { signal }), v => parseFanReply(v, accountId, fanId));
/** Success means the backend recorded the correction (outcome "recorded"); anything else is not success. */
export const correctField = (accountId: string, fanId: string, correction: Correction, signal?: AbortSignal) =>
  bFetch(`${base(accountId)}/fans/${enc(fanId)}`, { method: "PATCH", body: correction, signal });
/** "requested" only: the worker has not read any history yet. */
export const requestBackfill = (accountId: string, fanId: string | null, signal?: AbortSignal) =>
  bFetch(`${base(accountId)}/backfill`, { method: "POST", body: fanId ? { fanId } : {}, signal });

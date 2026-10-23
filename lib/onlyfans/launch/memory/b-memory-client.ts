import { bFetch, type BReply } from "../b-common";
import { parseAccountCoverage, parseFanMemory, type BAccountCoverage, type BFanMemory } from "./b-memory";

const enc = encodeURIComponent;
const base = (accountId: string) => `/api/onlyfans-launch/memory/accounts/${enc(accountId)}/fans`;
function shaped<T>(reply: BReply<unknown>, parse: (v: unknown) => T | null): BReply<T> {
  if (reply.kind !== "ok") return reply as BReply<T>;
  const parsed = parse(reply.data);
  return parsed ? { kind: "ok", data: parsed } : { kind: "unavailable", error: "The response was not in the expected shape, so nothing is shown." };
}
export const readCoverage = async (accountId: string, signal?: AbortSignal): Promise<BReply<BAccountCoverage>> =>
  shaped(await bFetch(base(accountId), { signal }), v => parseAccountCoverage(v, accountId));
export const readFanMemory = async (accountId: string, fanId: string, signal?: AbortSignal): Promise<BReply<BFanMemory>> =>
  shaped(await bFetch(`${base(accountId)}/${enc(fanId)}`, { signal }), v => parseFanMemory(v, accountId, fanId));
/** Correct one supported field. expectedRevision guards against a stale view. */
export const correctFact = (accountId: string, fanId: string, factId: string, value: string | null, expectedRevision: number, signal?: AbortSignal) =>
  bFetch(`${base(accountId)}/${enc(fanId)}`, { method: "PATCH", body: { factId, value, expectedRevision }, signal });

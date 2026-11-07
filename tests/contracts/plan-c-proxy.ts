/**
 * The dashboard's proxy routes as a `fetch`, for offline tests: the same pure handlers the route files call, in front of the
 * typed mock backend. Browser client -> this -> plan-c-backend client -> mock backend. The route files add only authentication
 * (planCGate), which tests/contracts/plan-c.test.ts checks separately.
 */
import { createPlanCBackend } from "../../lib/onlyfans/plan-c-backend";
import { parseCommandJson } from "../../lib/onlyfans/command-json";
import { planCConversationCommand, planCDraftCommand, planCReadDrafts, planCReadUnresolved, planCReconcile } from "../../lib/onlyfans/plan-c-route";
import { MOCK_ACCOUNT, MOCK_TOKEN, type PlanCMock } from "./plan-c-mock-backend";

export const OPERATOR_ACTOR = "op-session:" + "c".repeat(64);
export type ProxyCall = { method: string; path: string; body: unknown };

export function createPlanCProxy(mock: PlanCMock, actor = OPERATOR_ACTOR) {
  const backend = createPlanCBackend({ baseUrl: "http://backend.invalid", token: MOCK_TOKEN, fetchImpl: mock.fetch });
  const calls: ProxyCall[] = [];
  const proxy = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://fixture.invalid"), method = init?.method ?? "GET", path = decodeURIComponent(url.pathname);
    const body = init?.body ? parseCommandJson(String(init.body)) : undefined;
    calls.push({ method, path, body });
    const m = /^\/api\/onlyfans-controls\/accounts\/([^/]+)\/plan-c\/(.*)$/.exec(path);
    const send = (r: { status: number; body: Record<string, unknown> }) => Response.json(r.body, { status: r.status });
    if (!m) return new Response(null, { status: 404 });
    const accountId = m[1], rest = m[2];
    if (method === "GET" && rest === "drafts") return send(await planCReadDrafts(backend, accountId));
    if (method === "GET" && rest === "unresolved") return send(await planCReadUnresolved(backend, accountId));
    let x = /^drafts\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(rest);
    if (method === "POST" && x) return send(await planCDraftCommand(backend, { actor, accountId, requestId: x[1], generation: x[2], action: x[3], body }));
    x = /^conversations\/([^/]+)\/([^/]+)$/.exec(rest);
    if (method === "POST" && x) return send(await planCConversationCommand(backend, { actor, accountId, conversationId: x[1], action: x[2], body }));
    x = /^unresolved\/([^/]+)\/reconcile$/.exec(rest);
    if (method === "POST" && x) return send(await planCReconcile(backend, { actor, accountId, id: x[1], body }));
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  return { fetch: proxy, backend, calls, posts: () => calls.filter(c => c.method === "POST"), account: MOCK_ACCOUNT };
}

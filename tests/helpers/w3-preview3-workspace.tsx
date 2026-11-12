/**
 * OnlyFansWorkspace fixtures for the W3 ui-onlyfans-preview-3 tests: the real workspace with `source="server" view="inbox"`, the real
 * server data source and fetch transport, and only global fetch faked at the wire. Replies are in the exact envelopes
 * lib/onlyfans-preview/server-data-source.ts reads (`{accounts}`, `{page:{items,nextCursor}}`, `{conversation}`) and control acks that pass
 * lib/onlyfans/controls.ts parseControlAck. Data is the preview fixture set (lib/onlyfans-preview/fixtures.ts), cloned per test, the way
 * scripts/check-onlyfans-takeover-browser.mjs builds it. Side reads the inbox makes on its own (handover, saved content) answer 404/503,
 * which those components tolerate. Nothing here is cookie or token shaped.
 */
import { calls, click, json, mount, q, serve, type, type Call } from "./w3-preview3-dom";
import React from "react";
import { accounts, conversationDetails } from "../../lib/onlyfans-preview/fixtures";
import { CONTROL_SCHEMA } from "../../lib/onlyfans/controls";
import { denialBody, readAccounts, readConversations } from "../../lib/onlyfans/reads";
import type { OnlyFansBackend } from "../../lib/onlyfans/backend";
import type { ConversationDetail, OfAccount } from "../../lib/onlyfans-preview/types";

export const ACCOUNT = "of-acc-ava-001";
export const X = "of-conv-ava-1001";
export const Y = "of-conv-ava-1003";
export const INCIDENT = "of-conv-ava-1002";
export const PRINCIPAL = "w3p3-operator";
const CONV = `/api/onlyfans/accounts/${ACCOUNT}/conversations`;

/** A fresh world per test: Ava's account and her conversations, each overridable. */
export function world() {
  const account = structuredClone(accounts.find(a => a.accountId === ACCOUNT)!) as OfAccount;
  const details = Object.fromEntries(Object.entries(structuredClone(conversationDetails)).filter(([, d]) => d.accountId === ACCOUNT)) as Record<string, ConversationDetail>;
  return { account, details, order: [X, INCIDENT, Y] as string[] };
}
export type World = ReturnType<typeof world>;
/** A conversation the operator holds (human_controlled, takeover effective, nothing unresolved): the composer may send. */
export function held(w: World, id: string) {
  const s = w.details[id].summary;
  s.automationMode = "human_controlled"; s.takeoverState = "effective"; s.delivery = "sent"; w.details[id].deliveryIncident = null;
}

export const accountsReply = (w: World) => json({ accounts: [w.account] });
export const listReply = (w: World) => json({ page: { items: w.order.map(id => w.details[id].summary), nextCursor: null } });
export const detailReply = (w: World, id: string) => json({ conversation: w.details[id] });
/** A control ack in the exact shape parseControlAck accepts (manual: same revision + queued intent; other controls: revision + 1). */
export function ack(call: Call, intentId = "44444444-4444-4444-8444-444444444444") {
  const body = call.body as { action: string; expectedRevision: number };
  const [, , , accountId, , conversationId] = call.url.split("/").filter(Boolean).map(decodeURIComponent);
  const manual = body.action === "manual_message", resolve = body.action === "resolve_delivery_evidence";
  return json({ schemaVersion: CONTROL_SCHEMA, ok: true, applied: true, commandKey: "d".repeat(64), accountId, conversationId, action: body.action,
    recordedRevision: body.expectedRevision + (manual || resolve ? 0 : 1), ...(manual ? { intentId, outcome: "queued" } : {}) });
}
/**
 * The read route's own failure reply, built by the real lib/onlyfans/reads.ts (readAccounts / readConversations -> mapFailure, :155-156)
 * and denialBody (:256) the way readResponse/denialResponse (lib/onlyfans/route.ts:22-23,79-80) send it: an upstream 502 becomes a 503
 * `{ ok:false, state:"unavailable", code, error }`. Built per call so it cannot drift from the route.
 */
export async function routeReadFailure(read: "accounts" | "list") {
  const failure = { ok: false as const, status: 502 as const, code: "backend_malformed_response", error: "The OnlyFans backend answered with an unreadable response." };
  const backend = { label: "fake", listAccounts: async () => failure, listConversations: async () => failure, getConversation: async () => failure } as OnlyFansBackend;
  const input = { auth: { operatorSession: true, agency: false, viewAs: false }, backend };
  const result = read === "accounts" ? await readAccounts(input, { creatorId: null, accountId: null }) : await readConversations(input, { accountId: ACCOUNT, cursor: null });
  if (result.ok) throw new Error("fixture: the read route did not fail");
  return json(denialBody(result), result.status);
}
/** A proxy in front of the app answering 502 with its own HTML page (no JSON, no envelope). */
export const proxy502 = () => new Response("<html><body><h1>502 Bad Gateway</h1></body></html>", { status: 502, headers: { "Content-Type": "text/html" } });
/** The two real shapes of a failed read: the route's 503 envelope and a proxy's 502 page. */
export const READ_FAILURES = [["route 503", (read: "accounts" | "list") => routeReadFailure(read)], ["proxy 502", () => Promise.resolve(proxy502())]] as const;

/** The route's 400 refusal envelope (`refuse()` in the controls route). */
export const refused400 = () => json({ schemaVersion: CONTROL_SCHEMA, ok: false, outcome: "refused", error: "That conversation control request is invalid." }, 400);

type Answer = (call: Call, n: number) => Response | Promise<Response> | undefined;
export type Routes = Partial<Record<"accounts" | "list" | "detail" | "control" | "engine", Answer>>;
/**
 * Routes each request to its kind; `n` counts earlier requests of that kind (0 = first). Unset kinds answer from the world.
 * Handover answers 404 (the workspace treats it as no handover), saved content 503 ("Saved paid content is unavailable").
 */
export function workspaceBackend(w: World, routes: Routes = {}) {
  const seen: Record<string, number> = {};
  serve(call => {
    const path = call.url.split("?")[0];
    if (call.method === "GET" && path.endsWith("/handover")) return json({ error: "not found" }, 404);
    if (call.method === "GET" && path === `/api/onlyfans/accounts/${ACCOUNT}/workspace/content`) return json({ error: "unavailable" }, 503);
    const kind = call.method === "POST" ? (!path.startsWith(`/api/onlyfans-controls/accounts/${ACCOUNT}/conversations/`) ? null : path.includes("/requests/") ? "engine" : "control")
      : path === "/api/onlyfans/accounts" ? "accounts" : path === CONV ? "list" : path.startsWith(`${CONV}/`) ? "detail" : null;
    if (!kind) return undefined;
    const n = seen[kind] ?? 0; seen[kind] = n + 1;
    const own = routes[kind as keyof Routes];
    if (own) return own(call, n);
    if (kind === "accounts") return accountsReply(w);
    if (kind === "list") return listReply(w);
    if (kind === "detail") return detailReply(w, decodeURIComponent(path.slice(CONV.length + 1)));
    return undefined;
  });
}

export const controlPosts = () => calls.filter(c => c.method === "POST" && c.url.startsWith("/api/onlyfans-controls/"));
export const accountReads = () => calls.filter(c => c.method === "GET" && c.url.split("?")[0] === "/api/onlyfans/accounts");

/** jsdom reports "prerender"; an operator's tab is visible, and the workspace's polls only run in a visible tab. */
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
export async function mountWorkspace(extra: Record<string, unknown> = {}) {
  const { default: OnlyFansWorkspace } = await import("../../components/onlyfans-preview/OnlyFansWorkspace");
  await mount(<OnlyFansWorkspace view="inbox" source="server" canManage draftPrincipal={PRINCIPAL} {...extra} />, "/onlyfans/inbox");
}
/** The open conversation's id (the list row marked aria-current), or null. */
export const selectedId = () => q("[data-of-conversation-id][aria-current=\"true\"]")?.getAttribute("data-of-conversation-id") ?? null;
/** One open engine request on `id` (lib/onlyfans/engine-status.ts parseEngineStatus shape), so its "Request responsibility" control renders. */
export const engineStatus = (id: string, requestId = "55555555-5555-4555-8555-555555555555") => ({ schemaVersion: "of-engine.v1", state: "current",
  accountId: ACCOUNT, conversationId: id, environment: "simulation", mode: "active", salesMode: "open", truncated: false, nextCursor: null,
  requests: [{ requestId, sourceMessageId: "5001", status: "open", owner: "AI", nextStep: "reply", actionOutcome: null, revision: 3 }] });


export const composer = () => q<HTMLTextAreaElement>("[data-of-composer]");
export const sendButton = () => q<HTMLButtonElement>("[data-of-send]");
export const retryControl = () => q<HTMLButtonElement>("[data-of-retry-control]");
export const actionButton = (action: string) => q<HTMLButtonElement>(`[data-of-action="${action}"]`);
/** Types the reply and presses Send as creator (submits the composer form). */
export async function sendReply(text: string) {
  await type(composer(), text);
  const send = sendButton();
  if (!send || send.disabled) throw new Error("fixture: Send as creator is not enabled");
  await click(send);
}

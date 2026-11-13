/**
 * Plan C operator surface: shared types, parsers and body builders.
 *
 * Isomorphic on purpose. The browser client and the server proxy both import this file, so it holds
 * no credential, reads no environment variable and imports nothing server-only. The backend token
 * lives in plan-c-backend.ts, which the browser bundle must never import (tests/contracts/plan-c.test.ts).
 *
 * Contract: PLAN-C/OPERATOR-API-CONTRACT.md. Nothing here approves, hands back or sends by itself.
 */
export const PLAN_C_SCHEMA = "of-engine-operator.v2";
export const PLAN_C_HEADER = "X-OnlyFans-Engine-Operator-Version";
export const PLAN_C_MAX_BODY_BYTES = 8192;
export const PLAN_C_MESSAGES_MAX = 10;

export const PLAN_C_DRAFT_ACTIONS = ["approve", "reject", "edit"] as const;
export type PlanCDraftAction = typeof PLAN_C_DRAFT_ACTIONS[number];
export const PLAN_C_CONVERSATION_ACTIONS = ["stop", "takeover", "handback"] as const;
export type PlanCConversationAction = typeof PLAN_C_CONVERSATION_ACTIONS[number];
export const isPlanCDraftAction = (value: unknown): value is PlanCDraftAction => (PLAN_C_DRAFT_ACTIONS as readonly string[]).includes(value as string);
export const isPlanCConversationAction = (value: unknown): value is PlanCConversationAction => (PLAN_C_CONVERSATION_ACTIONS as readonly string[]).includes(value as string);

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const pick = (source: Record<string, unknown>, ...keys: string[]): unknown => { for (const key of keys) if (source[key] !== undefined) return source[key]; return undefined; };
const intIn = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const isoDate = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
const ID = /^[A-Za-z0-9._:-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const PLAN_C_COMMAND_KEY = /^[0-9a-f]{64}$/;
export const isPlanCCommandKey = (value: unknown): value is string => typeof value === "string" && PLAN_C_COMMAND_KEY.test(value);
export const isPlanCRequestId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
export const isPlanCId = (value: unknown): value is string => typeof value === "string" && ID.test(value);

/** A random 64-hex idempotency key (the same shape as the sha256 keys the existing client sends). Not derived from anything guessable. */
export function newCommandKey(random: (bytes: Uint8Array) => Uint8Array = bytes => globalThis.crypto.getRandomValues(bytes)): string {
  return Array.from(random(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
}

// ── Drafts ─────────────────────────────────────────────────────────────────────
export type PlanCPart = { index: number; action: "reply" | "offer"; text: string; priceCents: number | null; currency: string | null;
  mediaIds: string[]; previewIds: string[]; productId: string | null };
export type PlanCMessage = { who: string; text: string; at: string | null };
export type PlanCOffer = { productId: string | null; mediaCount: number; mediaIds: string[]; priceCents: number | null; currency: string | null };
export type PlanCDraft = {
  requestId: string; generation: number; draftVersion: number; draftHash: string;
  /** `awaiting` can be approved. `approved` is waiting for delivery. Anything else is shown but cannot be approved. */
  status: string;
  action: "reply" | "offer";
  parts: PlanCPart[];
  offer: PlanCOffer | null;
  expiresAt: string;
  fanId: string | null;
  conversationId: string;
  conversationRevision: number | null;
  messages: PlanCMessage[];
  evidence: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
};
export type PlanCReceipt = { intentId: string; fanId: string; messageId: string; acceptedAt: string;
  action: "reply" | "offer"; projected: boolean };
/** null means the connected backend did not provide receipt history. */
export type PlanCDraftList = { accountId: string; drafts: PlanCDraft[]; receipts: PlanCReceipt[] | null };

function strings(value: unknown, maxItems: number, maxLength = 64): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const out: string[] = [];
  for (const item of value) {
    const id = typeof item === "number" && Number.isInteger(item) ? String(item) : item;
    if (typeof id !== "string" || !id || id.length > maxLength) return null;
    out.push(id);
  }
  return out;
}
/**
 * Offer money terms, the backend's own: 300..20,000 cents (twin-onlyfans-backend fans_api_adapter/protocol.py:252,
 * db/onlyfans_offer_import_models.py:290) and USD only (conversation_engine/approval.py:53). Nothing outside is shown.
 */
export const PLAN_C_PRICE_MIN_CENTS = 300;
export const PLAN_C_PRICE_MAX_CENTS = 20_000;
export const PLAN_C_CURRENCY = "USD";
const absent = (value: unknown) => value === undefined || value === null;
const productId = (value: unknown): string | null | undefined =>
  absent(value) ? null : typeof value === "string" && ID.test(value) ? value : intIn(value, 0, 2 ** 53 - 1) ? String(value) : undefined;

/** A part is a reply (no money, no media, no product) or an offer (an in-bounds USD price). Anything else is refused. */
function parsePart(raw: unknown, position: number): PlanCPart | null {
  if (typeof raw === "string") return raw.length <= 4000 ? { index: position, action: "reply", text: raw, priceCents: null, currency: null, mediaIds: [], previewIds: [], productId: null } : null;
  if (!record(raw)) return null;
  const body = pick(raw, "text", "body"), index = pick(raw, "partIndex", "part_index", "index") ?? position, action = pick(raw, "action") ?? "reply";
  const price = pick(raw, "priceCents", "price_cents"), currency = pick(raw, "currency");
  const media = strings(pick(raw, "mediaIds", "media_ids"), 50), previews = strings(pick(raw, "previewIds", "preview_ids"), 50);
  const product = productId(pick(raw, "productId", "product_id", "catalogItemId", "catalog_item_id"));
  if (!text(body, 4000) || !intIn(index, 0, 1000) || !media || !previews || product === undefined) return null;
  if (action === "offer") {
    if (!intIn(price, PLAN_C_PRICE_MIN_CENTS, PLAN_C_PRICE_MAX_CENTS) || currency !== PLAN_C_CURRENCY) return null;
    return { index, action, text: body, priceCents: price, currency, mediaIds: media, previewIds: previews, productId: product };
  }
  if (action !== "reply" || !absent(price) || !absent(currency) || media.length || previews.length || product !== null) return null;
  return { index, action, text: body, priceCents: null, currency: null, mediaIds: [], previewIds: [], productId: null };
}

function parseMessages(value: unknown): PlanCMessage[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 200) return null;
  const out: PlanCMessage[] = [];
  for (const item of value.slice(-PLAN_C_MESSAGES_MAX)) {
    if (!record(item)) return null;
    const who = pick(item, "direction", "from", "role", "sender") ?? "message", body = pick(item, "text", "body"), at = pick(item, "at", "createdAt", "created_at", "sentAt");
    // Fan text is context, not terms: the backend does not cap it (operator_v2.py:168), so a long one is shortened, not refused.
    if (!text(who, 32) || !(body === undefined || body === null || typeof body === "string") || !(at === undefined || at === null || isoDate(at))) return null;
    out.push({ who, text: typeof body !== "string" ? "[no text]" : body.length > 4000 ? `${body.slice(0, 4000)} [shortened]` : body, at: typeof at === "string" ? at : null });
  }
  return out;
}

/** One draft. Returns null for anything that does not meet the contract: a half-read draft must never be offered for approval. */
export function parsePlanCDraft(raw: unknown, accountId: string): PlanCDraft | null {
  if (!record(raw)) return null;
  const requestId = pick(raw, "requestId", "request_id"), generation = raw.generation, version = pick(raw, "draftVersion", "version"), hash = pick(raw, "draftHash", "draft_hash");
  const fanId = pick(raw, "fanId", "fan_id"), expiresAt = pick(raw, "expiresAt", "expires_at"), status = raw.status;
  if (!isPlanCRequestId(requestId) || !intIn(generation, 0, 2 ** 31 - 1) || !intIn(version, 1, 2 ** 31 - 1) || typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash) ||
      !text(status, 32) || !status || !isoDate(expiresAt)) return null;
  const rawParts = raw.parts;
  if (!Array.isArray(rawParts) || !rawParts.length || rawParts.length > 8) return null;
  const parts: PlanCPart[] = [];
  for (const [position, part] of rawParts.entries()) { const parsed = parsePart(part, position); if (!parsed) return null; parts.push(parsed); }
  if (new Set(parts.map(part => part.index)).size !== parts.length) return null;
  parts.sort((a, b) => a.index - b.index);
  // The backend always names the conversation (operator_v2.py:239). It is the STOP target, so it is never derived here.
  const conversationId = pick(raw, "conversationId", "conversation_id");
  const fan = typeof fanId === "number" && Number.isInteger(fanId) ? String(fanId) : fanId;
  if (fan !== undefined && fan !== null && !(typeof fan === "string" && /^[0-9]{1,19}$/.test(fan))) return null;
  if (typeof conversationId !== "string" || !ID.test(conversationId) || !conversationId.startsWith(`${accountId}:`)) return null;
  const nested = record(raw.conversation) ? raw.conversation : {};
  const revision = pick(nested, "revision") ?? pick(raw, "conversationRevision", "conversation_revision");
  if (!(revision === undefined || revision === null || intIn(revision, 0, 2 ** 31 - 2))) return null;
  const messages = parseMessages(pick(nested, "messages") ?? pick(raw, "messages", "recentMessages"));
  const evidenceRaw = pick(raw, "evidence", "unresolvedEvidence", "unresolved_evidence");
  const evidence = evidenceRaw === undefined || evidenceRaw === null ? null : typeof evidenceRaw === "string" ? evidenceRaw : Array.isArray(evidenceRaw) && evidenceRaw.every(item => typeof item === "string") ? evidenceRaw.join("; ") : undefined;
  if (!messages || evidence === undefined || (evidence !== null && evidence.length > 2000)) return null;
  const approvedBy = pick(raw, "approvedBy", "actor"), approvedAt = pick(raw, "approvedAt", "decidedAt");
  if (!(approvedBy === undefined || approvedBy === null || text(approvedBy, 128)) || !(approvedAt === undefined || approvedAt === null || isoDate(approvedAt))) return null;
  const offer = parseOfferTerms(raw, parts);
  if (offer === undefined) return null;
  const action = offer ? "offer" : "reply";
  return { requestId, generation, draftVersion: version, draftHash: hash, status, action, parts, offer, expiresAt, fanId: typeof fan === "string" ? fan : null,
    conversationId, conversationRevision: typeof revision === "number" ? revision : null, messages,
    evidence: evidence ?? null, approvedBy: typeof approvedBy === "string" ? approvedBy : null, approvedAt: typeof approvedAt === "string" ? approvedAt : null };
}

/**
 * The offer is the terms of the one offer part that is sent (the backend allows one: engine.py:486, approval.py:574). Every
 * draft-level term the backend also sent must agree with that part exactly; a reply draft carries none. undefined: refuse.
 */
function parseOfferTerms(raw: Record<string, unknown>, parts: PlanCPart[]): PlanCOffer | null | undefined {
  const offerParts = parts.filter(part => part.action === "offer");
  if (offerParts.length > 1 || !(raw.action === undefined || raw.action === (offerParts.length ? "offer" : "reply"))) return undefined;
  const blocks = [raw.offer, raw.product];
  if (!blocks.every(block => absent(block) || record(block))) return undefined;
  const sources = [...blocks.filter(record), raw];
  const declared = (...keys: string[]) => sources.map(source => pick(source, ...keys)).filter(value => value !== undefined);
  const price = declared("priceCents", "price_cents"), currency = declared("currency"), count = declared("mediaCount", "media_count");
  const media = declared("mediaIds", "media_ids"), product = [...blocks.filter(record).map(block => pick(block, "productId", "product_id", "id")),
    pick(raw, "productId", "product_id")].filter(value => value !== undefined);
  const head = offerParts[0];
  if (!head) return [...blocks, ...price, ...currency, ...count, ...media, ...product].every(absent) ? null : undefined;
  const offer: PlanCOffer = { productId: head.productId, mediaCount: head.mediaIds.length, mediaIds: head.mediaIds, priceCents: head.priceCents, currency: head.currency };
  const sameMedia = (value: unknown) => { const ids = strings(value, 200); return !!ids && JSON.stringify(ids) === JSON.stringify(offer.mediaIds); };
  if (!price.every(value => value === offer.priceCents) || !currency.every(value => value === offer.currency) || !count.every(value => value === offer.mediaCount) ||
      !product.every(value => productId(value) === offer.productId) || !media.every(sameMedia)) return undefined;
  return offer;
}

/** The list is refused as a whole if any draft breaks the contract or the scope: a mixed page is not shown. */
export function parsePlanCDrafts(value: unknown, accountId: string): PlanCDraftList | null {
  if (!record(value) || value.schemaVersion !== PLAN_C_SCHEMA || value.ok === false || !Array.isArray(value.drafts) || value.drafts.length > 200) return null;
  // The backend always names the account (engine_approval_api.py:153); a list that does not is not tied to this one.
  if (value.accountId !== accountId) return null;
  const drafts: PlanCDraft[] = [];
  for (const raw of value.drafts) { const draft = parsePlanCDraft(raw, accountId); if (!draft) return null; drafts.push(draft); }
  if (new Set(drafts.map(draft => `${draft.requestId}:${draft.generation}`)).size !== drafts.length) return null;
  let receipts: PlanCReceipt[] | null = null;
  if (value.receipts !== undefined && value.receipts !== null) {
    if (!Array.isArray(value.receipts) || value.receipts.length > 50) return null;
    receipts = [];
    for (const raw of value.receipts) {
      if (!record(raw) || typeof raw.intentId !== "string" || !UUID.test(raw.intentId) ||
          typeof raw.fanId !== "string" || !/^[1-9][0-9]{0,18}$/.test(raw.fanId) ||
          typeof raw.messageId !== "string" || !/^[1-9][0-9]{0,18}$/.test(raw.messageId) ||
          !isoDate(raw.acceptedAt) || (raw.action !== "reply" && raw.action !== "offer") ||
          typeof raw.projected !== "boolean") return null;
      receipts.push({ intentId: raw.intentId, fanId: raw.fanId, messageId: raw.messageId,
                      acceptedAt: raw.acceptedAt, action: raw.action, projected: raw.projected });
    }
    if (new Set(receipts.map(receipt => receipt.intentId)).size !== receipts.length) return null;
  }
  return { accountId, drafts, receipts };
}

// ── Unresolved work ───────────────────────────────────────────────────────────
export type PlanCUnresolvedItem = { id: string; kind: string; owner: string; nextStep: string; summary: string | null;
  conversationId: string | null; conversationRevision: number | null; createdAt: string | null };
export type PlanCUnresolvedList = { accountId: string; items: PlanCUnresolvedItem[] };

export function parsePlanCUnresolved(value: unknown, accountId: string): PlanCUnresolvedList | null {
  if (!record(value) || value.schemaVersion !== PLAN_C_SCHEMA || value.ok === false || !Array.isArray(value.items) || value.items.length > 500) return null;
  if (value.accountId !== accountId) return null; // engine_approval_api.py:165
  const items: PlanCUnresolvedItem[] = [];
  for (const raw of value.items) {
    if (!record(raw)) return null;
    const id = raw.id, kind = pick(raw, "kind", "type"), owner = raw.owner, next = pick(raw, "nextStep", "next_step"), summary = raw.summary;
    const conversation = pick(raw, "conversationId", "conversation_id"), revision = pick(raw, "conversationRevision", "revision"), created = pick(raw, "createdAt", "created_at");
    if (!(typeof id === "string" && /^[A-Za-z0-9._:-]{1,100}$/.test(id)) || !text(kind, 64) || !kind || !text(owner, 64) || !owner || !text(next, 128) || !next ||
        !(summary === undefined || summary === null || text(summary, 1000)) ||
        !(conversation === undefined || conversation === null || (typeof conversation === "string" && ID.test(conversation) && conversation.startsWith(`${accountId}:`))) ||
        !(revision === undefined || revision === null || intIn(revision, 0, 2 ** 31 - 2)) || !(created === undefined || created === null || isoDate(created))) return null;
    items.push({ id, kind, owner, nextStep: next, summary: typeof summary === "string" ? summary : null,
      conversationId: typeof conversation === "string" ? conversation : null, conversationRevision: typeof revision === "number" ? revision : null,
      createdAt: typeof created === "string" ? created : null });
  }
  if (new Set(items.map(item => item.id)).size !== items.length) return null;
  return { accountId, items };
}

// ── Commands ──────────────────────────────────────────────────────────────────
/**
 * `reload` is true when the operator must re-read before deciding again: the draft moved on (409), no longer exists
 * (404, 410) or the conversation revision changed. A conflict is never retried with the same expected version.
 */
export type PlanCCommandResult =
  | { ok: true; replayed: boolean; recordedVersion: number | null; recordedRevision: number | null }
  | { ok: false; outcome: "refused" | "conflict" | "unconfirmed"; error: string; reload: boolean };

export const PLAN_C_CONFLICT_TEXT = "This draft or conversation changed since you loaded it. Read the current version in the list before deciding again.";
export const PLAN_C_UNCONFIRMED_TEXT = "The outcome is unconfirmed. Reload before acting again. Retrying the same action is safe: it reuses the same key.";
export const PLAN_C_REFUSED_TEXT = "The backend did not accept that action.";
/** 404 and 410: the draft, conversation or the route itself is not there. Not a conflict: nothing says it changed. */
export const PLAN_C_GONE_TEXT = "That draft, conversation or action is not available. The list was reloaded.";

/** Operator-written reason. Required: a rejection with no reason cannot be audited. */
export const PLAN_C_REASON_MAX = 200;
export const validateRejectReason = (reason: string): string | null => {
  const trimmed = reason.trim();
  if (!trimmed) return "Give a reason for rejecting this draft.";
  if (trimmed.length > PLAN_C_REASON_MAX) return `Keep the reason under ${PLAN_C_REASON_MAX} characters.`;
  if (/[\u0000-\u001f]/.test(trimmed)) return "The reason cannot contain control characters.";
  return null;
};

/** Edited part texts, checked without the draft: no empty part, no em or en dash in fan text, no control characters, inside the 8 KB command limit. */
export function validateEditTexts(texts: readonly string[]): string | null {
  if (!texts.length || texts.length > 8) return "An edit needs between one and eight parts.";
  if (texts.some(part => !part.trim())) return "Every part needs text.";
  if (texts.some(part => part.length > 2000)) return "Keep each part under 2000 characters.";
  if (texts.some(part => /[\u2013\u2014]/.test(part))) return "Do not use em or en dashes in fan text.";
  if (texts.some(part => /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(part))) return "Parts cannot contain control characters.";
  if (new TextEncoder().encode(JSON.stringify(texts)).length > 6000) return "The edited text is too long.";
  return null;
}
/** The same plus the draft rules: the part count is fixed and an unchanged edit is not an edit. */
export function validateEditedParts(draft: Pick<PlanCDraft, "parts">, texts: readonly string[]): string | null {
  if (texts.length !== draft.parts.length) return "An edit keeps the same number of parts.";
  const problem = validateEditTexts(texts);
  if (problem) return problem;
  if (texts.every((part, index) => part === draft.parts[index].text)) return "Change at least one part before saving an edit.";
  return null;
}

/** Evidence the operator checked, required to reconcile unresolved work. The audit string keeps the existing `operator:<environment>:` form. */
export const PLAN_C_EVIDENCE_MIN = 6;
export const PLAN_C_EVIDENCE_MAX = 108;
export function validateEvidenceRef(note: string): string | null {
  const trimmed = note.trim();
  if (trimmed.length < PLAN_C_EVIDENCE_MIN) return "Enter the evidence you checked (a provider message id, transaction id or what you saw).";
  if (trimmed.length > PLAN_C_EVIDENCE_MAX) return `Keep the evidence under ${PLAN_C_EVIDENCE_MAX} characters.`;
  if (/[\u0000-\u001f]/.test(trimmed)) return "The evidence cannot contain control characters.";
  return null;
}
/** Same string engineOperatorEvidenceRef("fansapi", note) builds (asserted in tests). Not imported: engine-operator.ts pulls the server credential reader into the browser graph. */
export const planCEvidenceRef = (note: string) => `operator:fansapi:${note.trim()}`;

/** How long is left, for display. Never used to decide anything: the backend owns expiry. */
export const minutesLeft = (expiresAt: string, now: number) => Math.floor((Date.parse(expiresAt) - now) / 60_000);
export const isExpired = (draft: Pick<PlanCDraft, "expiresAt">, now: number) => Date.parse(draft.expiresAt) <= now;
/** Approve is offered only for a draft that is awaiting approval and not past its expiry. */
export const canApprove = (draft: Pick<PlanCDraft, "status" | "expiresAt">, now: number) => draft.status === "awaiting" && !isExpired(draft, now);

/** A conversation the operator can stop, take over or hand back, with the revision the backend reported. */
export type PlanCConversation = { conversationId: string; revision: number | null; label: string };

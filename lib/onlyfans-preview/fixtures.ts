// Deterministic synthetic fixtures for the OF-D0 preview.
//
// Rules this file exists to honour:
//   * No private chats, session material, tokens, balances or customer media.
//     Every name, handle, message and amount below is invented.
//   * No randomness and no clock reads, so the preview and its tests are
//     byte-stable. `PREVIEW_NOW` is the anchor that staleness is measured from.
//   * The two accounts share no fan id, no conversation id and no money, so an
//     account switch that leaks selected state becomes visible immediately.
//
// These are workspace states, not the deployed product. Nothing here is a
// claim about a real creator, a real fan or a real sale.

import type {
  CapabilityState,
  ConversationDetail,
  ConversationSummary,
  FanContextFact,
  Freshness,
  IsoTimestamp,
  OfAccount,
  OwnedMediaItem,
} from "./types";
import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "./types";

/** Fixed anchor for every fixture timestamp. The preview never reads a clock. */
export const PREVIEW_NOW: IsoTimestamp = "2026-10-17T09:00:00.000Z";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function freshness(asOf: IsoTimestamp, maxAgeSeconds: number): Freshness {
  const age = (Date.parse(PREVIEW_NOW) - Date.parse(asOf)) / SECOND;
  return { asOf, maxAgeSeconds, stale: age > maxAgeSeconds };
}

function health(
  disabled: (keyof OfAccount["capabilities"])[] = [],
): OfAccount["capabilities"] {
  const value = (name: keyof OfAccount["capabilities"]): CapabilityState =>
    disabled.includes(name) ? "unavailable" : "available";
  return {
    viewConversations: "available",
    sendManualMessage: value("sendManualMessage"),
    pauseAutomation: value("pauseAutomation"),
    requestTakeover: value("requestTakeover"),
    manageContent: value("manageContent"),
    managePrices: value("managePrices"),
    viewSales: value("viewSales"),
    resolveDeliveryEvidence: value("resolveDeliveryEvidence"),
  };
}

// ── Account 1: healthy, mid-conversation, several distinct delivery states ────
export const ACCOUNT_AVA = "of-acc-ava-001";
export const ACCOUNT_NOVA = "of-acc-nova-002";
export const ACCOUNT_LUNA = "of-acc-luna-003";
/** Rell's account is unreachable, so reads are stale and no write is offered. */
export const ACCOUNT_RELL = "of-acc-rell-004";
/**
 * Ava's second OnlyFans account. One creator frequently runs more than one, so
 * the account list is per creator and a second account must not share an
 * inbox, a fan id or a cache entry with the first.
 */
export const ACCOUNT_AVA_SECOND = "of-acc-ava-005";

export const accounts: OfAccount[] = [
  {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    accountId: ACCOUNT_AVA,
    binding: {
      bindingId: "ofb-0001",
      creatorId: "creator-ava-0001",
      creatorName: "Ava Hart",
      handle: "avahart",
      channel: "onlyfans",
    },
    health: "connected",
    healthReason: null,
    automationMode: "automated",
    capabilities: health(),
    syncFreshness: freshness("2026-10-17T08:59:20.000Z", 120),
  },
  {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    accountId: ACCOUNT_NOVA,
    binding: {
      bindingId: "ofb-0002",
      creatorId: "creator-nova-0002",
      creatorName: "Nova Rey",
      handle: "novareyx",
      channel: "onlyfans",
    },
    health: "expired_session",
    healthReason: "Session expired. Reconnect is required before any send can be considered.",
    automationMode: "paused",
    // A dead session cannot accept new work, so the write-side capabilities are
    // unavailable while history stays readable.
    capabilities: health([
      "sendManualMessage",
      "pauseAutomation",
      "requestTakeover",
      "resolveDeliveryEvidence",
    ]),
    syncFreshness: freshness("2026-10-17T06:10:00.000Z", 900),
  },
  {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    accountId: ACCOUNT_LUNA,
    binding: {
      bindingId: "ofb-0003",
      creatorId: "creator-luna-0003",
      creatorName: "Luna Vale",
      handle: "lunavale",
      channel: "onlyfans",
    },
    health: "revoked",
    healthReason: "Access was revoked for this account. Nothing is read or sent until it is bound again.",
    automationMode: "no_contact",
    capabilities: health([
      "sendManualMessage",
      "pauseAutomation",
      "requestTakeover",
      "manageContent",
      "managePrices",
      "viewSales",
      "resolveDeliveryEvidence",
    ]),
    syncFreshness: freshness("2026-10-15T21:00:00.000Z", 900),
  },
  {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    accountId: ACCOUNT_RELL,
    binding: {
      bindingId: "ofb-0004",
      creatorId: "creator-rell-0004",
      creatorName: "Rell Quinn",
      handle: "rellquinn",
      channel: "onlyfans",
    },
    health: "disconnected",
    healthReason:
      "This account is not reachable right now. What you see is the last successful sync, and nothing can be sent until it is back.",
    automationMode: "paused",
    // A disconnected account still serves history, so reads stay available and
    // every write does not. That split is the point: connection health is not
    // automation mode and neither is delivery outcome.
    capabilities: health([
      "sendManualMessage",
      "pauseAutomation",
      "requestTakeover",
      "resolveDeliveryEvidence",
    ]),
    syncFreshness: freshness("2026-10-16T23:30:00.000Z", 900),
  },
  {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    accountId: ACCOUNT_AVA_SECOND,
    binding: {
      bindingId: "ofb-0005",
      creatorId: "creator-ava-0001",
      creatorName: "Ava Hart",
      handle: "avahartvip",
      channel: "onlyfans",
    },
    health: "connected",
    healthReason: null,
    automationMode: "automated",
    capabilities: health(),
    syncFreshness: freshness("2026-10-17T08:58:30.000Z", 120),
  },
];

const AVA_CONVERSATIONS: ConversationSummary[] = [
  {
    conversationId: "of-conv-ava-1001",
    accountId: ACCOUNT_AVA,
    revision: 42,
    fan: { fanId: "of-fan-ava-9001", displayName: "Fan 9001", shortRef: "9001" },
    lastMessagePreview: "that sounds perfect honestly",
    lastActivityAt: "2026-10-17T08:58:10.000Z",
    unreadCount: 2,
    priority: "priority",
    automationMode: "automated",
    takeoverState: "none",
    delivery: "sent",
    requiresAttention: false,
    freshness: freshness("2026-10-17T08:58:40.000Z", 120),
  },
  {
    conversationId: "of-conv-ava-1002",
    accountId: ACCOUNT_AVA,
    revision: 17,
    fan: { fanId: "of-fan-ava-9002", displayName: "Fan 9002", shortRef: "9002" },
    lastMessagePreview: "did the last video go through?",
    lastActivityAt: "2026-10-17T08:41:00.000Z",
    unreadCount: 0,
    priority: "priority",
    automationMode: "automated",
    takeoverState: "none",
    delivery: "unknown",
    requiresAttention: true,
    freshness: freshness("2026-10-17T08:41:30.000Z", 120),
  },
  {
    conversationId: "of-conv-ava-1003",
    accountId: ACCOUNT_AVA,
    revision: 9,
    fan: { fanId: "of-fan-ava-9003", displayName: "Fan 9003", shortRef: "9003" },
    lastMessagePreview: "thanks, I will sort it with you directly",
    lastActivityAt: "2026-10-17T08:12:00.000Z",
    unreadCount: 0,
    priority: "normal",
    automationMode: "human_controlled",
    takeoverState: "effective",
    delivery: "sent",
    requiresAttention: false,
    freshness: freshness("2026-10-17T08:12:30.000Z", 120),
  },
  {
    conversationId: "of-conv-ava-1004",
    accountId: ACCOUNT_AVA,
    revision: 4,
    fan: { fanId: "of-fan-ava-9004", displayName: "Fan 9004", shortRef: "9004" },
    lastMessagePreview: "please stop messaging me",
    lastActivityAt: "2026-10-16T22:05:00.000Z",
    unreadCount: 0,
    priority: "quiet",
    automationMode: "no_contact",
    takeoverState: "none",
    delivery: "refused",
    requiresAttention: false,
    freshness: freshness("2026-10-16T22:06:00.000Z", 120),
  },
  {
    conversationId: "of-conv-ava-1005",
    accountId: ACCOUNT_AVA,
    revision: 23,
    fan: { fanId: "of-fan-ava-9005", displayName: "Fan 9005", shortRef: "9005" },
    lastMessagePreview: "ok give me a minute",
    lastActivityAt: "2026-10-17T07:35:00.000Z",
    unreadCount: 1,
    priority: "normal",
    automationMode: "paused",
    takeoverState: "requested",
    delivery: "partial",
    requiresAttention: true,
    freshness: freshness("2026-10-17T07:36:00.000Z", 120),
  },
];

const NOVA_CONVERSATIONS: ConversationSummary[] = [
  {
    conversationId: "of-conv-nova-2001",
    accountId: ACCOUNT_NOVA,
    revision: 6,
    fan: { fanId: "of-fan-nova-8001", displayName: "Fan 8001", shortRef: "8001" },
    lastMessagePreview: "hey are you around",
    lastActivityAt: "2026-10-17T06:04:00.000Z",
    unreadCount: 3,
    priority: "priority",
    automationMode: "paused",
    takeoverState: "none",
    delivery: "none",
    requiresAttention: true,
    freshness: freshness("2026-10-17T06:05:00.000Z", 900),
  },
  {
    conversationId: "of-conv-nova-2002",
    accountId: ACCOUNT_NOVA,
    revision: 3,
    fan: { fanId: "of-fan-nova-8002", displayName: "Fan 8002", shortRef: "8002" },
    lastMessagePreview: "sent you a tip for the set",
    lastActivityAt: "2026-10-17T05:52:00.000Z",
    unreadCount: 0,
    priority: "normal",
    automationMode: "paused",
    takeoverState: "none",
    delivery: "failed",
    requiresAttention: true,
    freshness: freshness("2026-10-17T06:05:00.000Z", 900),
  },
];

/**
 * Rell's inbox. The queued action below is the instructive case: it exists and
 * is not dispatched, because the account itself is unreachable. A queued send on
 * a disconnected account is a hold, not a failure, and not a reason to resend.
 */
const RELL_CONVERSATIONS: ConversationSummary[] = [
  {
    conversationId: "of-conv-rell-3001",
    accountId: ACCOUNT_RELL,
    revision: 12,
    fan: { fanId: "of-fan-rell-7001", displayName: "Fan 7001", shortRef: "7001" },
    lastMessagePreview: "still waiting on that one if you have it",
    lastActivityAt: "2026-10-16T22:40:00.000Z",
    unreadCount: 1,
    priority: "priority",
    automationMode: "paused",
    takeoverState: "none",
    delivery: "queued",
    requiresAttention: true,
    freshness: freshness("2026-10-16T23:30:00.000Z", 900),
  },
  {
    conversationId: "of-conv-rell-3002",
    accountId: ACCOUNT_RELL,
    revision: 5,
    fan: { fanId: "of-fan-rell-7002", displayName: "Fan 7002", shortRef: "7002" },
    lastMessagePreview: "thanks for yesterday",
    lastActivityAt: "2026-10-16T19:02:00.000Z",
    unreadCount: 0,
    priority: "normal",
    automationMode: "human_controlled",
    takeoverState: "requested",
    delivery: "sent",
    requiresAttention: false,
    freshness: freshness("2026-10-16T23:30:00.000Z", 900),
  },
];

/**
 * Ava's second account. Deliberately a completely separate inbox: no fan id,
 * conversation id or message id is shared with the first account, so a leak
 * between the two becomes visible instead of plausible.
 */
const AVA_SECOND_CONVERSATIONS: ConversationSummary[] = [
  {
    conversationId: "of-conv-ava2-1101",
    accountId: ACCOUNT_AVA_SECOND,
    revision: 8,
    fan: { fanId: "of-fan-ava2-9101", displayName: "Fan 9101", shortRef: "9101" },
    lastMessagePreview: "hey, are you free tonight?",
    lastActivityAt: "2026-10-17T08:52:00.000Z",
    unreadCount: 2,
    priority: "priority",
    automationMode: "automated",
    takeoverState: "none",
    delivery: "sent",
    requiresAttention: false,
    freshness: freshness("2026-10-17T08:58:30.000Z", 120),
  },
  {
    conversationId: "of-conv-ava2-1102",
    accountId: ACCOUNT_AVA_SECOND,
    revision: 2,
    fan: { fanId: "of-fan-ava2-9102", displayName: "Fan 9102", shortRef: "9102" },
    lastMessagePreview: "sent a tip",
    lastActivityAt: "2026-10-17T07:10:00.000Z",
    unreadCount: 0,
    priority: "normal",
    automationMode: "human_controlled",
    takeoverState: "effective",
    delivery: "none",
    requiresAttention: false,
    freshness: freshness("2026-10-17T08:58:30.000Z", 120),
  },
];

export const conversationsByAccount: Record<string, ConversationSummary[]> = {
  [ACCOUNT_AVA]: AVA_CONVERSATIONS,
  [ACCOUNT_NOVA]: NOVA_CONVERSATIONS,
  [ACCOUNT_LUNA]: [],
  [ACCOUNT_RELL]: RELL_CONVERSATIONS,
  [ACCOUNT_AVA_SECOND]: AVA_SECOND_CONVERSATIONS,
};

function fact(
  label: string,
  value: string,
  source: FanContextFact["source"],
): FanContextFact {
  return { label, value, source };
}

function owned(
  mediaId: string,
  label: string,
  purchasedAt: IsoTimestamp,
  currency: string,
  minorUnits: number,
): OwnedMediaItem {
  return { mediaId, label, purchasedAt, price: { currency, minorUnits } };
}

export const conversationDetails: Record<string, ConversationDetail> = {
  "of-conv-ava-1001": {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    conversationId: "of-conv-ava-1001",
    accountId: ACCOUNT_AVA,
    summary: AVA_CONVERSATIONS[0],
    messages: [
      {
        messageId: "of-msg-ava-5001",
        conversationId: "of-conv-ava-1001",
        direction: "outbound",
        origin: "ai",
        body: "you are so sweet for saying that. i saved something for later tonight",
        occurredAt: "2026-10-17T08:42:00.000Z",
        delivery: "sent",
        evidenceRef: "of-receipt-ava-7001",
      },
      {
        messageId: "of-msg-ava-5002",
        conversationId: "of-conv-ava-1001",
        direction: "inbound",
        origin: "fan",
        body: "that sounds perfect honestly",
        occurredAt: "2026-10-17T08:58:10.000Z",
        delivery: "none",
        evidenceRef: null,
      },
    ],
    facts: [
      fact("Display name", "Fan 9001", "imported"),
      fact("Preferred tone", "Likes the teasing voice, dislikes voice notes", "fan_correction"),
      fact("Bought before", "Two photo sets in September", "purchase"),
    ],
    ownedMedia: [
      owned("of-media-ava-3001", "Late night set", "2026-09-14T19:20:00.000Z", "USD", 1800),
      owned("of-media-ava-3002", "Shower clip", "2026-09-28T21:40:00.000Z", "USD", 2500),
    ],
    deliveryIncident: null,
    freshness: freshness("2026-10-17T08:58:40.000Z", 120),
  },
  "of-conv-ava-1002": {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    conversationId: "of-conv-ava-1002",
    accountId: ACCOUNT_AVA,
    summary: AVA_CONVERSATIONS[1],
    messages: [
      {
        messageId: "of-msg-ava-5003",
        conversationId: "of-conv-ava-1002",
        direction: "outbound",
        origin: "ai",
        body: "here it is, tell me what you think",
        occurredAt: "2026-10-17T08:40:50.000Z",
        delivery: "unknown",
        evidenceRef: "of-attempt-ava-6001",
      },
      {
        messageId: "of-msg-ava-5004",
        conversationId: "of-conv-ava-1002",
        direction: "inbound",
        origin: "fan",
        body: "did the last video go through?",
        occurredAt: "2026-10-17T08:41:00.000Z",
        delivery: "none",
        evidenceRef: null,
      },
    ],
    facts: [fact("Display name", "Fan 9002", "imported")],
    ownedMedia: [],
    deliveryIncident: {
      attemptId: "of-attempt-ava-6001",
      outcome: "unknown",
      recordedAt: "2026-10-17T08:40:55.000Z",
      detail:
        "The provider response was not received. The send is held and nothing is retried until the outcome is resolved from provider evidence.",
    },
    freshness: freshness("2026-10-17T08:41:30.000Z", 120),
  },
  "of-conv-ava-1003": {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    conversationId: "of-conv-ava-1003",
    accountId: ACCOUNT_AVA,
    summary: AVA_CONVERSATIONS[2],
    messages: [
      {
        messageId: "of-msg-ava-5005",
        conversationId: "of-conv-ava-1003",
        direction: "outbound",
        origin: "human",
        body: "just picking this up myself, one moment",
        occurredAt: "2026-10-17T08:10:00.000Z",
        delivery: "sent",
        evidenceRef: "of-receipt-ava-7003",
      },
      {
        messageId: "of-msg-ava-5006",
        conversationId: "of-conv-ava-1003",
        direction: "inbound",
        origin: "fan",
        body: "thanks, I will sort it with you directly",
        occurredAt: "2026-10-17T08:12:00.000Z",
        delivery: "none",
        evidenceRef: null,
      },
    ],
    facts: [fact("Display name", "Fan 9003", "imported")],
    ownedMedia: [],
    deliveryIncident: null,
    freshness: freshness("2026-10-17T08:12:30.000Z", 120),
  },
  "of-conv-ava-1004": {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    conversationId: "of-conv-ava-1004",
    accountId: ACCOUNT_AVA,
    summary: AVA_CONVERSATIONS[3],
    messages: [
      {
        messageId: "of-msg-ava-5007",
        conversationId: "of-conv-ava-1004",
        direction: "inbound",
        origin: "fan",
        body: "please stop messaging me",
        occurredAt: "2026-10-16T22:05:00.000Z",
        delivery: "none",
        evidenceRef: null,
      },
    ],
    facts: [fact("Contact", "Asked for no further contact", "fan_correction")],
    ownedMedia: [],
    deliveryIncident: null,
    freshness: freshness("2026-10-16T22:06:00.000Z", 120),
  },
  "of-conv-ava-1005": {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    conversationId: "of-conv-ava-1005",
    accountId: ACCOUNT_AVA,
    summary: AVA_CONVERSATIONS[4],
    messages: [
      {
        messageId: "of-msg-ava-5008",
        conversationId: "of-conv-ava-1005",
        direction: "outbound",
        origin: "ai",
        body: "here is the second one",
        occurredAt: "2026-10-17T07:34:55.000Z",
        delivery: "sent",
        evidenceRef: "of-receipt-ava-7004",
      },
      {
        messageId: "of-msg-ava-5009",
        conversationId: "of-conv-ava-1005",
        direction: "outbound",
        origin: "ai",
        body: "and the third",
        occurredAt: "2026-10-17T07:34:58.000Z",
        delivery: "failed",
        evidenceRef: "of-attempt-ava-6002",
      },
      {
        messageId: "of-msg-ava-5010",
        conversationId: "of-conv-ava-1005",
        direction: "inbound",
        origin: "fan",
        body: "ok give me a minute",
        occurredAt: "2026-10-17T07:35:00.000Z",
        delivery: "none",
        evidenceRef: null,
      },
    ],
    facts: [fact("Display name", "Fan 9005", "imported")],
    ownedMedia: [],
    deliveryIncident: {
      attemptId: "of-attempt-ava-6002",
      outcome: "partial",
      recordedAt: "2026-10-17T07:35:02.000Z",
      detail:
        "One bubble was accepted and one was refused. The accepted bubble is never repeated; the refused bubble needs a new decision.",
    },
    freshness: freshness("2026-10-17T07:36:00.000Z", 120),
  },
  "of-conv-nova-2001": {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    conversationId: "of-conv-nova-2001",
    accountId: ACCOUNT_NOVA,
    summary: NOVA_CONVERSATIONS[0],
    messages: [
      {
        messageId: "of-msg-nova-4001",
        conversationId: "of-conv-nova-2001",
        direction: "inbound",
        origin: "fan",
        body: "hey are you around",
        occurredAt: "2026-10-17T06:04:00.000Z",
        delivery: "none",
        evidenceRef: null,
      },
    ],
    facts: [fact("Display name", "Fan 8001", "imported")],
    ownedMedia: [],
    deliveryIncident: null,
    freshness: freshness("2026-10-17T06:05:00.000Z", 900),
  },
  "of-conv-nova-2002": {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    conversationId: "of-conv-nova-2002",
    accountId: ACCOUNT_NOVA,
    summary: NOVA_CONVERSATIONS[1],
    messages: [
      {
        messageId: "of-msg-nova-4002",
        conversationId: "of-conv-nova-2002",
        direction: "outbound",
        origin: "human",
        body: "sending the set now",
        occurredAt: "2026-10-17T05:50:00.000Z",
        delivery: "failed",
        evidenceRef: "of-attempt-nova-6001",
      },
      {
        messageId: "of-msg-nova-4003",
        conversationId: "of-conv-nova-2002",
        direction: "inbound",
        origin: "fan",
        body: "sent you a tip for the set",
        occurredAt: "2026-10-17T05:52:00.000Z",
        delivery: "none",
        evidenceRef: null,
      },
    ],
    facts: [fact("Display name", "Fan 8002", "imported")],
    ownedMedia: [],
    deliveryIncident: {
      attemptId: "of-attempt-nova-6001",
      outcome: "failed",
      recordedAt: "2026-10-17T05:50:04.000Z",
      detail: "The provider refused the request. The session has since expired, so nothing is retried.",
    },
    freshness: freshness("2026-10-17T06:05:00.000Z", 900),
  },
  "of-conv-rell-3001": {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    conversationId: "of-conv-rell-3001",
    accountId: ACCOUNT_RELL,
    summary: RELL_CONVERSATIONS[0],
    messages: [
      {
        messageId: "of-msg-rell-4501",
        conversationId: "of-conv-rell-3001",
        direction: "inbound",
        origin: "fan",
        body: "still waiting on that one if you have it",
        occurredAt: "2026-10-16T22:40:00.000Z",
        delivery: "none",
        evidenceRef: null,
      },
      {
        messageId: "of-msg-rell-4502",
        conversationId: "of-conv-rell-3001",
        direction: "outbound",
        origin: "ai",
        body: "sending it now",
        occurredAt: "2026-10-16T22:41:00.000Z",
        // Queued, not sent. The account went unreachable before dispatch, so the
        // action is held rather than reported as delivered.
        delivery: "queued",
        evidenceRef: "of-attempt-rell-6501",
      },
    ],
    facts: [fact("Display name", "Fan 7001", "imported")],
    ownedMedia: [],
    deliveryIncident: null,
    freshness: freshness("2026-10-16T23:30:00.000Z", 900),
  },
  "of-conv-rell-3002": {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    conversationId: "of-conv-rell-3002",
    accountId: ACCOUNT_RELL,
    summary: RELL_CONVERSATIONS[1],
    messages: [
      {
        messageId: "of-msg-rell-4503",
        conversationId: "of-conv-rell-3002",
        direction: "outbound",
        origin: "human",
        body: "any time, glad you liked it",
        occurredAt: "2026-10-16T19:00:00.000Z",
        delivery: "sent",
        evidenceRef: "of-receipt-rell-7501",
      },
      {
        messageId: "of-msg-rell-4504",
        conversationId: "of-conv-rell-3002",
        direction: "inbound",
        origin: "fan",
        body: "thanks for yesterday",
        occurredAt: "2026-10-16T19:02:00.000Z",
        delivery: "none",
        evidenceRef: null,
      },
    ],
    facts: [fact("Display name", "Fan 7002", "imported")],
    ownedMedia: [owned("of-media-rell-3501", "Weekend set", "2026-10-02T20:10:00.000Z", "GBP", 1200)],
    deliveryIncident: null,
    freshness: freshness("2026-10-16T23:30:00.000Z", 900),
  },
  "of-conv-ava2-1101": {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    conversationId: "of-conv-ava2-1101",
    accountId: ACCOUNT_AVA_SECOND,
    summary: AVA_SECOND_CONVERSATIONS[0],
    messages: [
      {
        messageId: "of-msg-ava2-5101",
        conversationId: "of-conv-ava2-1101",
        direction: "outbound",
        origin: "ai",
        body: "i had a feeling you would ask",
        occurredAt: "2026-10-17T08:50:00.000Z",
        delivery: "sent",
        evidenceRef: "of-receipt-ava2-7101",
      },
      {
        messageId: "of-msg-ava2-5102",
        conversationId: "of-conv-ava2-1101",
        direction: "inbound",
        origin: "fan",
        body: "hey, are you free tonight?",
        occurredAt: "2026-10-17T08:52:00.000Z",
        delivery: "none",
        evidenceRef: null,
      },
    ],
    facts: [
      fact("Display name", "Fan 9101", "imported"),
      fact("Preferred tone", "Short replies, no pet names", "fan_correction"),
    ],
    ownedMedia: [],
    deliveryIncident: null,
    freshness: freshness("2026-10-17T08:58:30.000Z", 120),
  },
  "of-conv-ava2-1102": {
    schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION,
    conversationId: "of-conv-ava2-1102",
    accountId: ACCOUNT_AVA_SECOND,
    summary: AVA_SECOND_CONVERSATIONS[1],
    messages: [
      {
        messageId: "of-msg-ava2-5103",
        conversationId: "of-conv-ava2-1102",
        direction: "inbound",
        origin: "fan",
        body: "sent a tip",
        occurredAt: "2026-10-17T07:10:00.000Z",
        delivery: "none",
        evidenceRef: null,
      },
    ],
    facts: [fact("Display name", "Fan 9102", "imported")],
    ownedMedia: [],
    deliveryIncident: null,
    freshness: freshness("2026-10-17T08:58:30.000Z", 120),
  },
};

/** Convenience for the harness: the account and conversation shown on load. */
export const DEFAULT_ACCOUNT_ID = ACCOUNT_AVA;
export const DEFAULT_CONVERSATION_ID = "of-conv-ava-1001";

/**
 * Deliberately not a full calendar: the preview only needs a stable, readable
 * label for "when did this happen" and never a locale-sensitive format.
 */
export function formatPreviewTime(value: IsoTimestamp): string {
  const iso = new Date(value).toISOString();
  return `${iso.slice(11, 16)} UTC`;
}

export function formatAge(value: IsoTimestamp): string {
  const ms = Date.parse(PREVIEW_NOW) - Date.parse(value);
  if (ms < MINUTE) return "just now";
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}m ago`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h ago`;
  return `${Math.round(ms / DAY)}d ago`;
}

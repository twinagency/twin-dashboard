// OF-D0 view models for the OnlyFans dashboard surface.
//
// These types are the frontend contract for the consolidated OnlyFans backend
// described in twin-sexbot/docs/onlyfans/CONSOLIDATION_PLAN.md. They are
// deliberately channel-agnostic of Telegram: an OnlyFans fan is never stored in
// `telegram_id`, OnlyFans money is never a Stars column, and a creator account
// binding is its own record rather than a persona `platforms` string.
//
// Nothing here reads a database, calls a provider or imports the live root
// layout. The fixture implementation in ./fixture-data-source.ts is the only
// implementation shipped in OF-D0.
//
// Ownership note: this module is owned by the OF dashboard track. The backend
// remains the sole authority for history, attempts and commerce; every field
// below is a projection or a request, never a second writable ledger.

/** Bumped whenever a read model changes shape. Carried on every read model. */
export const ONLYFANS_PREVIEW_SCHEMA_VERSION = "of-preview.v2" as const;
export type OnlyFansPreviewSchemaVersion = typeof ONLYFANS_PREVIEW_SCHEMA_VERSION;

export type IsoTimestamp = string;

/**
 * Money is an integer number of minor units plus an explicit ISO-4217 currency.
 * There is no implicit currency, no float, and no conversion between currencies
 * or between a currency and any Stars balance.
 */
export type Money = {
  currency: string;
  minorUnits: number;
};

/** Connection health is independent of automation mode and delivery outcome. */
export type ConnectionHealth =
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "expired_session"
  | "revoked";

/** Who currently owns replies in a conversation. */
export type AutomationMode = "automated" | "human_controlled" | "paused" | "no_contact";

/** A takeover request is not effective until the backend confirms it. */
export type TakeoverState = "none" | "requested" | "effective";

/**
 * Per-message and per-conversation delivery outcome. "sent" means the provider
 * accepted the request. It never implies read, and never implies purchased.
 */
export type DeliveryOutcome =
  | "none"
  | "generating"
  | "queued"
  | "dispatching"
  | "accepted_pending"
  | "sent"
  | "retracted"
  | "partial"
  | "unknown"
  | "refused"
  | "failed";

/** Freshness is always explicit so a cached value cannot read as current. */
export type Freshness = {
  asOf: IsoTimestamp | null;
  /** How old this projection may be before it must render as stale. */
  maxAgeSeconds: number;
  stale: boolean;
};

/** Availability of a single backend capability for one account. */
export type CapabilityState = "available" | "unavailable" | "not_configured";

/**
 * Which operations the backend currently advertises for an account. A preview
 * fixture sets these; a live adapter must read them from the scoped API.
 */
export type AccountCapabilities = {
  viewConversations: CapabilityState;
  sendManualMessage: CapabilityState;
  pauseAutomation: CapabilityState;
  requestTakeover: CapabilityState;
  manageContent: CapabilityState;
  managePrices: CapabilityState;
  viewSales: CapabilityState;
  resolveDeliveryEvidence: CapabilityState;
};

export type AccountBinding = {
  /** Stable, backend-owned binding id. Never a browser-supplied account header. */
  bindingId: string;
  /** Opaque creator identity from the existing Twin identity system. */
  creatorId: string;
  creatorName: string;
  /** Provider-side handle, for display only. */
  handle: string;
  channel: "onlyfans";
};

export type OfAccount = {
  schemaVersion: OnlyFansPreviewSchemaVersion;
  accountId: string;
  binding: AccountBinding;
  health: ConnectionHealth;
  /** Why the account needs a human, when it does. Never a raw provider error. */
  healthReason: string | null;
  automationMode: AutomationMode;
  capabilities: AccountCapabilities;
  syncFreshness: Freshness;
  runtime?: { enabled: boolean; deliveryEnabled: boolean; sender: { state: string; observedAt: string | null; reason: string | null } };
  needsAttention?: boolean;
  syncHealth?: Record<string, { lastSuccessAt?: string | null; latestMessageAt?: string | null; pending?: number; pendingConversations?: number; quarantined?: number; fullHistoryAt?: string | null; state?: string; observedAt?: string | null; reason?: string | null }>;

};

export type FanRef = {
  /** Account-scoped fan identity. Two accounts never share this string. */
  fanId: string;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  /** Short opaque reference for display when the name is unavailable. */
  shortRef: string;
};

export type ConversationPriority = "normal" | "priority" | "quiet";

export type ConversationSummary = {
  conversationId: string;
  accountId: string;
  /**
   * Backend revision of this conversation. A command must state the revision it
   * was decided against, so a command decided on stale state is refused rather
   * than applied to a conversation that has moved on.
   */
  revision: number;
  fan: FanRef;
  lastMessagePreview: string;
  lastMessageId?: string | null;
  lastActivityAt: IsoTimestamp;
  unreadCount: number;
  priority: ConversationPriority;
  automationMode: AutomationMode;
  takeoverState: TakeoverState;
  delivery: DeliveryOutcome;
  /** True when a human is required before the conversation can progress. */
  requiresAttention: boolean;
  attentionReasons?: string[];
  historyHeld?: boolean;
  freshness: Freshness;
};

export type MessageOrigin = "fan" | "ai" | "human" | "imported";

export type MessageAttachments = {
  count: number;
  media: { mediaId: string; kind: "photo" | "video" | "audio" | "unknown"; source?: "message" }[];
  price: Money;
  purchaseStatus: "not_applicable" | "unconfirmed" | "not_purchased" | "purchased";
};

export type ConversationMessage = {
  messageId: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  origin: MessageOrigin;
  body: string;
  occurredAt: IsoTimestamp;
  delivery: DeliveryOutcome;
  /** Present only when a resolution workflow should cite evidence. */
  evidenceRef: string | null;
  /** Optional during rollout and for older saved conversations. */
  attachments?: MessageAttachments;
};

export type FanContextFact = {
  label: string;
  value: string;
  /** Where this fact came from, so a corrected fact is distinguishable. */
  source: "creator" | "fan_correction" | "purchase" | "imported";
};

export type OwnedMediaItem = {
  mediaId: string;
  label: string;
  purchasedAt: IsoTimestamp;
  price: Money;
};

export type ConversationDetail = {
  schemaVersion: OnlyFansPreviewSchemaVersion;
  conversationId: string;
  accountId: string;
  summary: ConversationSummary;
  messages: ConversationMessage[];
  /** Keyset position for the older page in this exact account and thread. */
  previousCursor?: string | null;
  spend?: { minorUnits: number | null; currency: string; coverage: "unknown" | "partial" | "complete"; asOf: string | null; detail: string };
  facts: FanContextFact[];
  ownedMedia: OwnedMediaItem[];
  /** A summary of a structured resolution path when delivery is unresolved. */
  deliveryIncident: {
    attemptId: string;
    outcome: DeliveryOutcome;
    recordedAt: IsoTimestamp;
    detail: string;
  } | null;
  freshness: Freshness;
};

/** One page of a cursor-paged read. */
export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

/**
 * Every read is a request state. Empty, unavailable and zero are three
 * different things and must stay distinguishable in the UI.
 *
 * `unavailable` is the state for "the backend that would answer this is not
 * configured or not reachable" — the scoped OnlyFans API is not stood up in
 * this environment. It is deliberately NOT an `error`: an error means the read
 * was attempted and failed, and a surface that renders an outage as `error`
 * would read as a bug in the dashboard rather than as a missing backend. It is
 * also not `empty`, which means the backend answered and there is nothing.
 */
export type RequestState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "empty" }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string }
  | { status: "stale"; data: T; freshness: Freshness };

/**
 * What the browser is asking the server for.
 *
 * These ids are a *request*, never an authorization. Both are validated
 * server-side against the session's own scope: `creatorId` selects within the
 * creators that session may read, and `accountId` must appear in the authorized
 * account list before anything is read from it. A browser id that is not
 * authorized is simply not in the answer.
 */
export type AccountScopeRequest = {
  creatorId?: string | null;
  accountId?: string | null;
};

/** Who is looking at the dashboard, as the server would have derived it. */
export type PreviewViewer = {
  kind: "operator" | "view_as";
  label: string;
  canManage: boolean;
  /** Live staff ownership for the selected conversation; undefined in fixtures. */
  canActAsOwner?: boolean;
  /** Account ids this viewer may read. A view-as session is always narrower. */
  scopedAccountIds: string[];
};

/** Preview vocabulary; the live source implements only scoped local controls. */
export type PreviewCommand =
  | "pause_automation"
  | "resume_automation"
  | "request_takeover"
  | "release_takeover"
  | "mark_no_contact"
  | "send_manual_message"
  | "resolve_delivery_evidence";

/** What provider evidence shows for an unresolved send. */
export type DeliveryResolutionDecision = "delivered" | "not_delivered";

/**
 * A command's payload.
 *
 * Commands are discriminated by `kind`, so an invalid combination (a pause with
 * a message body, a send with no text) is a type error rather than a runtime
 * surprise, and so the idempotency key can be derived from the content the
 * operator actually decided rather than from the command name alone. Two
 * different messages sent against the same revision are two different commands.
 */
export type CommandPayload =
  | { kind: "manual_message"; body: string; catalogItemId?: number | null }
  | { kind: "delivery_resolution"; attemptId: string; decision: DeliveryResolutionDecision; providerMessageId?: string }
  | { kind: "none" };

/** The payload for a command that carries no content. */
export const NO_PAYLOAD: CommandPayload = { kind: "none" };

/**
 * A command request carries an idempotency key and the revision it expects, so
 * a retry after a lost acknowledgement reuses the same identity.
 */
export type CommandRequest = {
  commandId: string;
  idempotencyKey: string;
  command: PreviewCommand;
  /**
   * The account the command is scoped to. A conversation id is only unique
   * within an account, so carrying the account is what stops a command from
   * being routed to the wrong binding.
   */
  accountId: string;
  conversationId: string;
  expectedRevision: number;
  payload: CommandPayload;
};

/**
 * The only result OF-D0 can honestly produce: the request was checked against
 * the modelled contract, and nothing was sent anywhere. `applied` is always
 * false. `accepted` says whether the request satisfied the contract, so a
 * refusal is distinguishable from a successful simulation rather than both
 * reading as the same quiet no-op.
 */
export type SimulatedCommandResult = {
  simulated: true;
  applied: false;
  accepted: boolean;
  refusalReason: string | null;
  request: CommandRequest;
  note: string;
};

export type CommandResult = SimulatedCommandResult | import("../onlyfans/controls").RecordedControlResult;

/** Why an action is offered or withheld. Reasons are shown, never hidden. */
export type ActionAvailability = {
  action: AvailableAction;
  label: string;
  /** Null when the action is available. */
  reason: string | null;
};

/** Per-message actions the UI may offer, decided outside the model. */
export type AvailableAction =
  | "send_manual_message"
  | "pause_automation"
  | "resume_automation"
  | "request_takeover"
  | "release_takeover"
  | "mark_no_contact"
  | "resolve_delivery_evidence";

// ── Channel navigation ───────────────────────────────────────────────────────
//
// The channel model lives in `lib/channel-nav.ts`, not here. It is shared with
// the dashboard's own Sidebar, TopBar and breadcrumb, so the channel split has
// exactly one definition: adding it as a second copy in the preview's types was
// how the preview could have drifted from the product it is previewing.

/**
 * The shared creator identity.
 *
 * A creator is selected once and scopes every channel. Each channel then has
 * its own account selection underneath: Telegram has its Business connection,
 * and OnlyFans has one or more creator accounts. The account list is per
 * creator, never the other way round, and an OnlyFans account is never derived
 * from a persona field or a Telegram bot id.
 */
export type PreviewCreator = {
  creatorId: string;
  name: string;
  initials: string;
  /** Avatar colour, in the dashboard's own clone shape used by CloneSwitcher. */
  color: string;
  telegram: { connected: boolean; note: string };
  /** OnlyFans account ids bound to this creator, in display order. */
  onlyfansAccountIds: string[];
};

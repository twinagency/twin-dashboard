/** Launch dashboard contract (of-launch.v1). Pending backend contracts are labelled; nothing here claims a connection. */
export const LAUNCH_SCHEMA = "of-launch.v1";
export const LAUNCH_HEADER = "X-OnlyFans-Launch-Version";

export type Screen = "readiness" | "purchases" | "personality";
export const SCREENS: Screen[] = ["readiness", "purchases", "personality"];
export const SCREEN_LABELS: Record<Screen, string> = {
  readiness: "A. Readiness", purchases: "B. Purchases", personality: "C. Personality and AI",
};

/** Honest registry of what is wired. "backend-pending" means: the proxy exists, the backend endpoint does not. */
export type Wiring = "connected" | "partial" | "backend-pending";
export const WIRING: Record<Screen, { wiring: Wiring; note: string }> = {
  readiness: { wiring: "backend-pending", note: "Needs GET launch/v1/readiness. AI configuration row reads the real configuration contract." },
  purchases: { wiring: "backend-pending", note: "Needs Chat 1 ledger read/command contract." },
  personality: { wiring: "partial", note: "Persona, facts, model and sales switch use the real configuration contract. Drafts, approval and budget need Chat 3." },
};

export type Status = "ok" | "warn" | "blocked" | "unknown";
export type Blocker = { id: string; area: string; status: Status; title: string; detail: string; evidence: string | null;
  action: { label: string; kind: "link" | "command"; href?: string; command?: string } | null };
export type Readiness = { asOf: string | null; blockers: Blocker[] };

export type PurchaseKind = "failed_import" | "unmatched" | "reversal";
export type EvidenceRef = { id: string; source: string; ref: string; observedAt: string | null };
export type PurchaseItem = { id: string; kind: PurchaseKind; status: "open" | "retry_queued" | "resolved"; revision: number; fanId: string | null;
  messageId: string | null; amountCents: number | null; currency: string | null; reason: string; evidence: EvidenceRef[];
  audit: { at: string; actor: string; resolution: string; reason: string; evidenceId: string | null }[] };
export type LedgerScan = { state: "complete" | "running" | "held" | "never_started" | "unknown"; offset: number | null; error: string | null; appliedOwnershipRows: number | null; messagesMarkedPaid: number | null };
export type Purchases = { scan: LedgerScan; items: PurchaseItem[]; nextCursor: string | null };
export const RESOLUTIONS = ["confirmed_owned", "not_owned", "leave_unmatched"] as const;
export type Resolution = typeof RESOLUTIONS[number];

export type PersonalityDraft = { id: string; revision: number; field: string; imported: string; edited: string | null; source: string; approved: boolean };
export type PersonalitySettings = { drafts: PersonalityDraft[]; configApproved: boolean; configRevision: number; model: string | null; dailyBudgetCents: number | null; behaviour: { maxRepliesPerHour: number | null; allowSales: boolean | null } };

const o = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const s = (v: unknown): v is string => typeof v === "string";
const sn = (v: unknown): v is string | null => v === null || typeof v === "string";
const nn = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v));
const rev = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const arr = <T,>(v: unknown, f: (x: unknown) => x is T): v is T[] => Array.isArray(v) && v.length <= 500 && v.every(f);

const isBlocker = (b: unknown): b is Blocker => o(b) && s(b.id) && s(b.area) && ["ok", "warn", "blocked", "unknown"].includes(b.status as string) && s(b.title) && s(b.detail) && sn(b.evidence) &&
  (b.action === null || (o(b.action) && s(b.action.label) && ["link", "command"].includes(b.action.kind as string) &&
    (b.action.href === undefined || (s(b.action.href) && b.action.href.startsWith("/"))) && (b.action.command === undefined || s(b.action.command))));
const isEvidence = (e: unknown): e is EvidenceRef => o(e) && s(e.id) && s(e.source) && s(e.ref) && sn(e.observedAt);
const isAudit = (a: unknown): a is PurchaseItem["audit"][number] => o(a) && s(a.at) && s(a.actor) && s(a.resolution) && s(a.reason) && sn(a.evidenceId);
const isPurchase = (p: unknown): p is PurchaseItem => o(p) && s(p.id) && ["failed_import", "unmatched", "reversal"].includes(p.kind as string) &&
  ["open", "retry_queued", "resolved"].includes(p.status as string) && rev(p.revision) && sn(p.fanId) && sn(p.messageId) && nn(p.amountCents) && sn(p.currency) && s(p.reason) &&
  arr(p.evidence, isEvidence) && arr(p.audit, isAudit);
const isDraft = (d: unknown): d is PersonalityDraft => o(d) && s(d.id) && rev(d.revision) && s(d.field) && s(d.imported) && sn(d.edited) && s(d.source) && typeof d.approved === "boolean";

/** Each parser returns null on any shape violation: an unparseable answer is an error, never "empty". */
export const parseReadiness = (v: unknown): Readiness | null => o(v) && sn(v.asOf) && arr(v.blockers, isBlocker) ? { asOf: v.asOf, blockers: v.blockers } : null;
export const parsePurchases = (v: unknown): Purchases | null => o(v) && o(v.scan) && ["complete", "running", "held", "never_started", "unknown"].includes(v.scan.state as string) &&
  nn(v.scan.offset) && sn(v.scan.error) && nn(v.scan.appliedOwnershipRows) && nn(v.scan.messagesMarkedPaid) && arr(v.items, isPurchase) && sn(v.nextCursor) ? v as unknown as Purchases : null;
export const parsePersonality = (v: unknown): PersonalitySettings | null => o(v) && arr(v.drafts, isDraft) && typeof v.configApproved === "boolean" && rev(v.configRevision) && sn(v.model) && nn(v.dailyBudgetCents) &&
  o(v.behaviour) && nn(v.behaviour.maxRepliesPerHour) && (v.behaviour.allowSales === null || typeof v.behaviour.allowSales === "boolean") ? v as unknown as PersonalitySettings : null;
export const PARSERS = { readiness: parseReadiness, purchases: parsePurchases, personality: parsePersonality } as const;

/** Client request shapes. They never carry actor, command key, price, evidence text or credentials. */
export const ID = /^[A-Za-z0-9._:-]{1,64}$/;
export type LaunchCommand =
  | { path: "purchases/retry"; id: string; body: { expectedRevision: number } }
  | { path: "purchases/resolve"; id: string; body: { expectedRevision: number; resolution: Resolution; reason: string; evidenceId: string | null } }
  | { path: "personality/draft"; id: string; body: { expectedRevision: number; edited: string } }
  | { path: "personality/approve"; id: null; body: { expectedRevision: number } }
  | { path: "personality/settings"; id: null; body: { expectedRevision: number; model: string; dailyBudgetCents: number; maxRepliesPerHour: number; allowSales: boolean } }

const keys = (v: Record<string, unknown>, k: string[]) => Object.keys(v).sort().join(",") === [...k].sort().join(",");
const text = (v: unknown, max: number): v is string => s(v) && !!v.trim() && v.length <= max;
export function validCommand(c: unknown): c is LaunchCommand {
  if (!o(c) || !o(c.body) || !s(c.path)) return false;
  const b = c.body, id = c.id;
  if (!rev(b.expectedRevision)) return false;
  switch (c.path) {
    case "purchases/retry": return keys(b, ["expectedRevision"]) && s(id) && ID.test(id);
    case "purchases/resolve": return keys(b, ["expectedRevision", "resolution", "reason", "evidenceId"]) && s(id) && ID.test(id) &&
      (RESOLUTIONS as readonly unknown[]).includes(b.resolution) && text(b.reason, 500) && (b.evidenceId === null || (s(b.evidenceId) && ID.test(b.evidenceId))) &&
      // "Confirmed owned" must cite existing evidence; it can never be asserted on its own.
      (b.resolution !== "confirmed_owned" || b.evidenceId !== null);
    case "personality/draft": return keys(b, ["expectedRevision", "edited"]) && s(id) && ID.test(id) && text(b.edited, 4096);
    case "personality/approve": return keys(b, ["expectedRevision"]) && id === null;
    case "personality/settings": return keys(b, ["expectedRevision", "model", "dailyBudgetCents", "maxRepliesPerHour", "allowSales"]) && id === null && text(b.model, 160) &&
      Number.isInteger(b.dailyBudgetCents) && (b.dailyBudgetCents as number) >= 0 && (b.dailyBudgetCents as number) <= 1_000_000 &&
      Number.isInteger(b.maxRepliesPerHour) && (b.maxRepliesPerHour as number) >= 0 && (b.maxRepliesPerHour as number) <= 1000 && typeof b.allowSales === "boolean";
    default: return false;
  }
}
/** Commands that change money-adjacent state, AI authority or outgoing behaviour need manage rights; all do, none is read-only. */
export const READ_PATHS: Record<Screen, string> = { readiness: "readiness", purchases: "purchases", personality: "personality" };

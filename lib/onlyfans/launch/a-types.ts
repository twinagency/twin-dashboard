/** Launch dashboard response schema and the readiness checklist types. Everything shown is read from a delivered backend contract. */
export const LAUNCH_SCHEMA = "of-launch-b.v1";

export type Status = "ok" | "warn" | "blocked" | "unknown";
export type Blocker = { id: string; area: string; status: Status; title: string; detail: string; evidence: string | null; action: { label: string; href: string } | null };
export type Readiness = { asOf: string | null; blockers: Blocker[] };

const o = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const s = (v: unknown): v is string => typeof v === "string";
const sn = (v: unknown): v is string | null => v === null || typeof v === "string";
const isBlocker = (b: unknown): b is Blocker => o(b) && s(b.id) && s(b.area) && ["ok", "warn", "blocked", "unknown"].includes(b.status as string) && s(b.title) && s(b.detail) && sn(b.evidence) &&
  (b.action === null || (o(b.action) && s(b.action.label) && s(b.action.href) && b.action.href.startsWith("/")));
/** Returns null on any shape violation: an unparseable answer is an error, never "empty". */
export const parseReadiness = (v: unknown): Readiness | null =>
  o(v) && sn(v.asOf) && Array.isArray(v.blockers) && v.blockers.length <= 50 && v.blockers.every(isBlocker) ? { asOf: v.asOf, blockers: v.blockers } : null;
export const parseAccess = (v: unknown): { canManage: boolean; accountPause: boolean } | null =>
  o(v) && typeof v.canManage === "boolean" && typeof v.accountPause === "boolean" ? { canManage: v.canManage, accountPause: v.accountPause } : null;

export { ID } from "./live/shared";
export type Screen = "readiness" | "ledger" | "personality";
export const SCREENS: Screen[] = ["readiness", "ledger", "personality"];
export const SCREEN_LABELS: Record<Screen, string> = { readiness: "A. Readiness", ledger: "B. Purchases", personality: "C. Personality and AI" };
/** What each screen is wired to. Every screen reads delivered contracts; a failed read shows as unavailable, never as a pass. */
export const WIRING: Record<Screen, string> = {
  readiness: "Built from live reads of connection, history, ledger, personality and engagement. A read that fails shows as Not verified.",
  ledger: "Reads the ledger status contract (of-ledger.v1). Retry only queues a held scan; it never marks anything reconciled.",
  personality: "Import, review, approval and history use the personality contract. Readiness comes from the backend credential check.",
};

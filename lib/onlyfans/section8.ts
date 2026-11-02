/** Presentation helpers for chat media previews, vault summaries, settings facts and operations rows. No I/O. */

export type PreviewState = "preparing" | "preparing_timeout" | "expired" | "unsupported" | "unavailable" | "denied" | "temporary";
export type PreviewOutcome = { status: number | null; mimeOk?: boolean };
export const PREVIEW_MAX_ATTEMPTS = 3;
export const PREVIEW_BACKOFF_MS = [2000, 5000] as const;

/** Map one preview response to a state. 202 is preparing; 404 means the source is gone; 410 an expired link; 415 or a wrong content type is unsupported. */
export function classifyPreview(outcome: PreviewOutcome): PreviewState {
  if (outcome.mimeOk === false) return "unsupported";
  switch (outcome.status) {
    case 202: return "preparing";
    case 401: case 403: return "denied";
    case 404: return "unavailable";
    case 410: return "expired";
    case 415: return "unsupported";
    default: return "temporary";
  }
}
export type PreviewStep = { action: "retry"; delayMs: number } | { action: "stop"; state: PreviewState };
/** attempt is 1 for the first response. Only preparing and temporary states retry, at most PREVIEW_MAX_ATTEMPTS times. */
export function nextPreviewStep(attempt: number, outcome: PreviewOutcome): PreviewStep {
  const state = classifyPreview(outcome);
  if (state !== "preparing" && state !== "temporary") return { action: "stop", state };
  if (attempt >= PREVIEW_MAX_ATTEMPTS) return { action: "stop", state: state === "preparing" ? "preparing_timeout" : "temporary" };
  return { action: "retry", delayMs: PREVIEW_BACKOFF_MS[Math.min(attempt - 1, PREVIEW_BACKOFF_MS.length - 1)] };
}
export const PREVIEW_COPY: Record<PreviewState, { title: string; hint: string; retryable: boolean }> = {
  preparing: { title: "Preview preparing", hint: "The preview is being prepared. It appears when processing finishes.", retryable: false },
  preparing_timeout: { title: "Still preparing", hint: "The preview was not ready after 3 checks. Try again later.", retryable: true },
  expired: { title: "Link expired", hint: "The provider link for this file expired. Sync the conversation history to refresh it.", retryable: false },
  unsupported: { title: "Unsupported type", hint: "This file type cannot be previewed here.", retryable: false },
  unavailable: { title: "Source unavailable", hint: "The original file is no longer available from the provider.", retryable: false },
  denied: { title: "Permission denied", hint: "Your session cannot view this media. Sign in again or ask an account operator.", retryable: false },
  temporary: { title: "Preview unavailable", hint: "The preview service did not answer after 3 tries.", retryable: true },
};

export function vaultSelectionSummary(input: { folderName: string | null; folderCount: number | null; matching: number | null; kind: string; query: string; needsReview: boolean }): string {
  const parts = [input.folderName ? `Category: ${input.folderName}${input.folderCount === null ? "" : ` (${input.folderCount.toLocaleString()})`}` : "Category: All media"];
  parts.push(`Type: ${input.needsReview ? "Needs review" : input.kind === "all" ? "All" : input.kind === "photo" ? "Photos" : "Videos"}`);
  if (input.query) parts.push(`Search: "${input.query}"`);
  if (input.matching !== null) parts.push(`${input.matching.toLocaleString()} matching files`);
  return parts.join(" · ");
}
export const MULTI_CATEGORY_NOTE = "One file can belong to several categories, so category counts can add up to more than the total. Duplicates are separate files.";

export function syncStatusLine(sync: { status: string; requestedAt: string; updatedAt: string; completedAt: string | null; itemsSeen: number } | null, fmt: (iso: string) => string = iso => new Date(iso).toLocaleString()): string {
  if (!sync) return "Sync: Not run yet";
  if (sync.status === "pending") return `Sync: Queued since ${fmt(sync.requestedAt)}${sync.updatedAt !== sync.requestedAt ? `, last progress ${fmt(sync.updatedAt)}` : ""}`;
  if (sync.status === "running") return `Sync: Running, ${sync.itemsSeen.toLocaleString()} files checked, last progress ${fmt(sync.updatedAt)}`;
  if (sync.status === "failed") return `Sync: Failed, last progress ${fmt(sync.updatedAt)}`;
  if (sync.status === "complete") return `Sync: Completed ${fmt(sync.completedAt ?? sync.updatedAt)}`;
  return "Sync: Replaced by a newer request";
}

export type FactSource = "not_provided" | "override" | "inherited" | "saved";
export function factSource(input: { value: string; overridden: boolean; sharedState: string }): FactSource {
  if (!input.value.trim()) return "not_provided";
  if (input.overridden) return "override";
  return input.sharedState === "unconfigured" ? "saved" : "inherited";
}
export const FACT_SOURCE_LABEL: Record<FactSource, string> = { not_provided: "Not provided", override: "OnlyFans override", inherited: "Inherited from Twin", saved: "Saved on this account" };

type Reason = string;
export type ReasonGroup = { key: "connection" | "history" | "payments" | "memory" | "vault" | "sending"; title: string; reasons: Reason[] };
const GROUP_OF: Record<string, ReasonGroup["key"]> = {
  runtime_not_registered: "connection", runtime_disabled: "connection",
  history_recovery_required: "history", intake_count_mismatch: "history", history_not_current: "history", history_sync_time_invalid: "history", history_quarantined: "history", waiting_queue_older_than_two_minutes: "history",
  commerce_evidence_conflict: "payments",
  creator_facts_not_current: "memory", generation_unresolved: "memory", generation_held: "memory", model_cost_unresolved: "memory", model_budget_exhausted: "memory",
  delivery_unresolved: "sending", delivery_in_progress: "sending", receipt_projection_pending: "sending", delivery_disabled: "sending", cap_exhausted: "sending",
};
export const GROUP_TITLES: Record<ReasonGroup["key"], string> = { connection: "Provider connection", history: "Recent inbox and archive history", payments: "Payment imports", memory: "Memory and reply generation", vault: "Vault", sending: "Sending readiness" };
/** Group hold reasons by area. Groups with no holds are omitted. */
export function groupReasons(reasons: readonly string[]): ReasonGroup[] {
  const out = new Map<ReasonGroup["key"], ReasonGroup>();
  for (const reason of reasons) {
    const key = GROUP_OF[reason] ?? "sending";
    if (!out.has(key)) out.set(key, { key, title: GROUP_TITLES[key], reasons: [] });
    out.get(key)!.reasons.push(reason);
  }
  return [...out.values()];
}
export const GROUP_NEXT: Record<ReasonGroup["key"], { label: string; path: string }> = {
  connection: { label: "Review account connection", path: "/onlyfans/accounts" },
  history: { label: "Open inbox history", path: "/onlyfans/inbox" },
  payments: { label: "Review earnings", path: "/onlyfans/sales" },
  memory: { label: "Review creator settings", path: "/onlyfans/settings" },
  vault: { label: "Open vault", path: "/onlyfans/content" },
  sending: { label: "Open launch control", path: "/onlyfans/launch" },
};

type OpsLike = { providerConnectionVerified: boolean; intake: { pending: number; quarantined: number }; work: { blocked: number };
  delivery: { queued: number; unknown: number; dispatching: number }; reasons: readonly string[];
  runtime: { registered: boolean; enabled: boolean; recoveryRequired: boolean; lastCompleteSyncAt: string | null };
  policy: { enabled: boolean; usedUnits: number; limitUnits: number } | null };
export type OperationRow = { key: string; title: string; status: string; lastSuccess: string; action: string; path: string };
/** Distinct readiness rows. Fields the snapshot does not carry read "Not reported". Offers links only, never a reset or bypass. */
export function operationRows(d: OpsLike): OperationRow[] {
  const held = (group: ReasonGroup["key"]) => groupReasons(d.reasons).some(g => g.key === group);
  const NR = "Not reported";
  return [
    { key: "provider", title: "Provider connection", status: d.providerConnectionVerified ? "Verified" : d.runtime.registered ? (d.runtime.enabled ? "Not verified" : "Paused") : "Not set up", lastSuccess: NR, action: GROUP_NEXT.connection.label, path: GROUP_NEXT.connection.path },
    { key: "inbox", title: "Recent inbox", status: d.intake.quarantined ? `${d.intake.quarantined} conflicting` : d.intake.pending ? `${d.intake.pending} waiting` : "Up to date", lastSuccess: NR, action: "Open inbox", path: "/onlyfans/inbox" },
    { key: "archive", title: "Archive history", status: d.runtime.recoveryRequired ? "Recovery required" : d.runtime.lastCompleteSyncAt ? "Synchronized" : "Not completed", lastSuccess: d.runtime.lastCompleteSyncAt ?? NR, action: GROUP_NEXT.history.label, path: GROUP_NEXT.history.path },
    { key: "payments", title: "Payment imports", status: held("payments") ? "Needs review" : NR, lastSuccess: NR, action: GROUP_NEXT.payments.label, path: GROUP_NEXT.payments.path },
    { key: "memory", title: "Memory", status: held("memory") ? "Held" : NR, lastSuccess: NR, action: GROUP_NEXT.memory.label, path: GROUP_NEXT.memory.path },
    { key: "vault", title: "Vault", status: NR, lastSuccess: NR, action: GROUP_NEXT.vault.label, path: GROUP_NEXT.vault.path },
    { key: "sending", title: "Sending readiness", status: held("sending") || held("connection") ? "Held" : d.policy && !d.policy.enabled ? "Disabled" : "No hold recorded", lastSuccess: NR, action: GROUP_NEXT.sending.label, path: GROUP_NEXT.sending.path },
  ];
}

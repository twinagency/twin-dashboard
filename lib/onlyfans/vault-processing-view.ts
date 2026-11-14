/** Pure display logic for the vault processing panel. The one rule everything here serves: only a v4 (full) job that finished
 * with every stream resolved and counts that reconcile may be called a full import. Window (v1-v3), legacy, capped, partial,
 * restarted, superseded, failed or unreported coverage can never read as "complete". */
import type { VaultCoverage, VaultSync } from "./vault";
import type { VaultAnalysis, VaultAnalysisCounts, VaultProcessingStatus } from "./vault-processing";

export type Tone = "complete" | "progress" | "warning" | "problem" | "unknown";
export type SyncLite = Pick<VaultSync, "status"> & Partial<Pick<VaultSync, "coverage" | "scope" | "lastError" | "jobId">>;
export type Kind = "photo" | "video";
const KINDS: Kind[] = ["photo", "video"];
export const ELIGIBILITY_NOTE = "A finished description does not make a file sellable. Price, approval and sale permission are separate steps, and generated text never changes them.";
export const safeText = (value: string | null | undefined, max = 80) => (value ?? "").replace(/[^A-Za-z0-9_:.-]/g, "?").slice(0, max);
const fmt = (n: number | null | undefined) => typeof n === "number" ? n.toLocaleString("en-US") : "unknown";

const STATE_RANK: Record<VaultCoverage["state"], number> = { in_progress: 0, unresolved: 1, partial: 2, complete: 3 };
const REASONS: Record<string, string> = {
  page_limit: "The provider vault is larger than the import page limit, so reading stopped before everything was seen.",
  window_not_full_vault: "This job only imports the newest media in a window. Older media on the provider was not requested.",
  legacy_scan_not_proven_full: "This older scan never proved it covered the whole provider vault.",
  retrying: "The provider is slow or erroring. The import is retrying and keeps its progress.",
  retry_exhausted: "The import gave up after repeated provider errors. Imported files are kept.",
  imported_below_provider_total: "The provider reports more files than were imported.",
  counts_missing: "The import reported complete but did not report counts that could confirm it.",
  coverage_not_reported: "The backend did not report what this import covered.",
  provider_read_deferred: "The provider asked the import to wait. It will resume by itself.",
  unreadable_reason: "The reason could not be read safely.",
  superseded: "A newer sync replaced this one.",
  failed: "The sync stopped with an error.",
  not_established: "The import did not say how its completeness was established.",
};
export function reasonText(code: string | null | undefined): string | null {
  if (!code) return null;
  const head = code.split(":")[0];
  const tail = code.includes(":") ? code.slice(code.indexOf(":") + 1) : "";
  const base = REASONS[code] ?? REASONS[head];
  return base ? (tail && !REASONS[code] ? `${base} (${safeText(tail)})` : base) : `Reason code: ${safeText(code)}`;
}

export type ImportRow = { kind: Kind; label: string; providerTotal: number | null; uniqueImported: number | null; seen: number | null; text: string };
export type ImportView = {
  /** True only for a proven full vault import. */
  isFull: boolean; tone: Tone; stateLabel: string; headline: string; scopeLabel: string;
  reason: string | null; reasonCode: string | null; establishedBy: string | null; rows: ImportRow[]; notFullNotice: string | null;
};

/** Pick the most conservative of the status coverage and the sync coverage; a running or failed latest sync overrides a stale "complete". */
export function effectiveCoverage(statusCoverage: VaultCoverage | null | undefined, sync: SyncLite | null | undefined): VaultCoverage | null {
  const fullComplete = (c: VaultCoverage) => c.scope === "full" && c.state === "complete";
  const [fromStatus, fromSync] = [statusCoverage ?? null, sync?.coverage ?? null];
  let chosen: VaultCoverage | null = fromStatus ?? fromSync;
  if (fromStatus && fromSync) {
    if (fullComplete(fromStatus) !== fullComplete(fromSync)) chosen = fullComplete(fromStatus) ? fromSync : fromStatus;
    else if (!fullComplete(fromStatus)) chosen = STATE_RANK[fromSync.state] <= STATE_RANK[fromStatus.state] ? fromSync : fromStatus;
  }
  if (!sync) return chosen;
  const none = { photo: null, video: null };
  const fromScope: VaultCoverage["scope"] = sync.scope?.version === 4 ? "full" : sync.scope ? "window" : "legacy";
  if (sync.status === "pending" || sync.status === "running") {
    if (chosen?.state === "in_progress") return chosen;
    return { scope: chosen?.scope ?? fromScope, state: "in_progress", reason: null, established_by: null, providerTotal: chosen?.providerTotal ?? none, seen: chosen?.seen ?? none, uniqueImported: chosen?.uniqueImported ?? none };
  }
  if ((sync.status === "failed" || sync.status === "superseded") && (!chosen || chosen.state === "complete" || chosen.state === "partial")) {
    // The latest job did not finish, so an older finished picture does not describe the current state.
    return { scope: chosen?.scope ?? fromScope, state: "unresolved", reason: sync.status === "failed" ? safeText(sync.lastError) || "failed" : "superseded", established_by: null,
      providerTotal: chosen?.providerTotal ?? none, seen: chosen?.seen ?? none, uniqueImported: chosen?.uniqueImported ?? none };
  }
  if (!chosen) {
    // Older backend without coverage: infer only what is certain. A v4 job without coverage is never assumed complete.
    return { scope: fromScope, state: "partial", reason: sync.scope?.version === 4 ? "coverage_not_reported" : fromScope === "legacy" ? "legacy_scan_not_proven_full" : "window_not_full_vault",
      established_by: null, providerTotal: none, seen: none, uniqueImported: none };
  }
  return chosen;
}

export function importView(statusCoverage: VaultCoverage | null | undefined, sync?: SyncLite | null): ImportView {
  const coverage = effectiveCoverage(statusCoverage, sync);
  if (!coverage) return { isFull: false, tone: "unknown", stateLabel: "Not reported", headline: "Import coverage is not reported yet.", scopeLabel: "Unknown scope",
    reason: null, reasonCode: null, establishedBy: null, rows: [], notFullNotice: "Nothing here proves the full vault was imported." };
  let { state, reason } = coverage;
  // A "complete" claim must be provable from the numbers it ships with.
  if (coverage.scope === "full" && state === "complete") {
    const { providerTotal, uniqueImported } = coverage;
    if (!coverage.established_by) { state = "partial"; reason = "not_established"; }
    else if (coverage.established_by === "provider_total" && KINDS.some(k => providerTotal[k] === null || uniqueImported[k] === null)) { state = "partial"; reason = "counts_missing"; }
    else if (KINDS.some(k => providerTotal[k] !== null && uniqueImported[k] !== null && (uniqueImported[k] as number) < (providerTotal[k] as number))) { state = "partial"; reason = "imported_below_provider_total"; }
  }
  const isFull = coverage.scope === "full" && state === "complete";
  const scopeLabel = coverage.scope === "full" ? "Full vault (every photo and video, no item cap)"
    : coverage.scope === "window" ? "Window import only (newest media, capped)" : "Older scan (scope unproven)";
  const stateLabel = isFull ? "Complete" : state === "in_progress" ? "In progress" : state === "unresolved" ? "Unresolved" : "Partial";
  const tone: Tone = isFull ? "complete" : state === "in_progress" ? "progress" : state === "unresolved" ? "problem" : "warning";
  const headline = isFull ? "Full vault imported."
    : coverage.scope === "full" ? state === "in_progress" ? "Full vault import in progress. Counts are not final." : state === "unresolved" ? "Full vault import did not finish." : "Full vault import is not proven complete."
    : coverage.scope === "window" ? "Only a window of the vault was imported. This is not the full vault."
    : "Imported by an older scan. This is not proven to be the full vault.";
  const rows = KINDS.map<ImportRow>(kind => {
    const total = coverage.providerTotal[kind], unique = coverage.uniqueImported[kind], seen = coverage.seen[kind];
    const label = kind === "photo" ? "Photos" : "Videos";
    return { kind, label, providerTotal: total, uniqueImported: unique, seen,
      text: `${label}: ${fmt(unique)} unique imported of ${total === null ? "provider total not reported" : fmt(total) + " on the provider"}${seen !== null ? `, ${fmt(seen)} rows read` : ""}` };
  });
  return { isFull, tone, stateLabel, headline, scopeLabel, reasonCode: isFull ? null : reason, reason: isFull ? null : reasonText(reason),
    establishedBy: isFull ? coverage.established_by === "provider_total" ? "Matched the provider's reported totals." : "Traversed every page; the provider reported no total." : null,
    rows, notFullNotice: isFull ? null : "Do not treat the imported library as the whole provider vault." };
}

export type AnalysisView = {
  state: "not_reported" | "idle" | "active" | "attention" | "waiting" | "inconsistent" | "done" | "done_partial_import";
  tone: Tone; headline: string; coverageNote: string | null;
  totals: { label: string; value: number }[]; rows: { kind: Kind; label: string; text: string }[];
  unresolved: { code: string; label: string; count: number }[]; skippedOperator: number;
};
const UNRESOLVED_LABELS: Record<string, string> = {
  credential_missing: "Describe credential missing", credential_invalid: "Describe credential rejected", budget_exhausted: "Describe budget exhausted",
  provider_error: "Model provider error", model_refused: "Model declined to describe", media_unavailable: "Media not readable", media_expired: "Media link expired",
  media_too_large: "Media too large", timeout: "Timed out", unsupported_kind: "Unsupported media kind", other: "Other reasons",
};
const unresolvedLabel = (code: string) => UNRESOLVED_LABELS[code] ?? `Reason code: ${safeText(code)}`;
const done = (c: VaultAnalysisCounts) => c.queued === 0 && c.processing === 0 && c.unresolved === 0 && c.waitingRetry === 0 && c.eligible > 0 && c.completed + c.skippedOperator >= c.eligible;
export function analysisView(analysis: VaultAnalysis | null | undefined, importIsFull: boolean): AnalysisView {
  const empty = { totals: [], rows: [], unresolved: [], skippedOperator: 0 };
  if (!analysis) return { state: "not_reported", tone: "unknown", headline: "Analysis status is not reported.", coverageNote: null, ...empty };
  const sum = analysis.completed + analysis.queued + analysis.processing + analysis.unresolved + analysis.waitingRetry;
  const kindSum = (field: keyof VaultAnalysisCounts) => KINDS.reduce((n, k) => n + (analysis.byKind[k]?.[field] ?? 0), 0);
  const kindsReported = KINDS.every(k => analysis.byKind[k]);
  const inconsistent = sum > analysis.eligible || (kindsReported && (["eligible", "queued", "processing", "completed", "unresolved"] as const).some(f => kindSum(f) !== analysis[f]));
  const totals = [["Eligible", analysis.eligible], ["Queued", analysis.queued], ["Processing", analysis.processing], ["Completed", analysis.completed], ["Unresolved", analysis.unresolved], ["Waiting to retry", analysis.waitingRetry]]
    .filter(([label, value]) => label !== "Waiting to retry" || (value as number) > 0)
    .map(([label, value]) => ({ label: label as string, value: value as number }));
  const rows = KINDS.flatMap(kind => { const c = analysis.byKind[kind]; return c ? [{ kind, label: kind === "photo" ? "Photos" : "Videos",
    text: `${c.eligible.toLocaleString("en-US")} eligible: ${c.queued.toLocaleString("en-US")} queued, ${c.processing.toLocaleString("en-US")} processing, ${c.completed.toLocaleString("en-US")} completed, ${c.unresolved.toLocaleString("en-US")} unresolved${c.waitingRetry ? `, ${c.waitingRetry.toLocaleString("en-US")} waiting to retry` : ""}${c.skippedOperator ? `, ${c.skippedOperator.toLocaleString("en-US")} skipped by operator` : ""}` }] : []; });
  const unresolved = Object.entries(analysis.unresolvedReasons).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code, count]) => ({ code, label: unresolvedLabel(code), count }));
  const base = { totals, rows, unresolved, skippedOperator: analysis.skippedOperator };
  if (inconsistent) return { state: "inconsistent", tone: "warning", headline: "Analysis counts do not add up. Treat them as unreliable and refresh.", coverageNote: null, ...base };
  if (analysis.queued + analysis.processing > 0) return { state: "active", tone: "progress", headline: `Describing: ${analysis.processing.toLocaleString("en-US")} processing, ${analysis.queued.toLocaleString("en-US")} queued.`, coverageNote: importIsFull ? null : "Only items imported so far are described. The vault import is not full.", ...base };
  if (analysis.unresolved > 0) return { state: "attention", tone: "problem", headline: `${analysis.unresolved.toLocaleString("en-US")} items could not be described. Fix the cause, then retry.`, coverageNote: null, ...base };
  if (analysis.waitingRetry > 0) return { state: "waiting", tone: "warning", headline: `${analysis.waitingRetry.toLocaleString("en-US")} items wait for an automatic retry (media not readable yet).`, coverageNote: null, ...base };
  if (analysis.eligible === 0) return { state: "idle", tone: "unknown", headline: "No eligible items to describe yet.", coverageNote: null, ...base };
  if (!done(analysis)) return { state: "waiting", tone: "warning", headline: `${Math.max(0, analysis.eligible - analysis.completed - analysis.skippedOperator).toLocaleString("en-US")} eligible items are not queued yet.`, coverageNote: null, ...base };
  return importIsFull
    ? { state: "done", tone: "complete", headline: "Every eligible imported item has a description.", coverageNote: analysis.skippedOperator ? "Operator-skipped items are not described." : null, ...base }
    : { state: "done_partial_import", tone: "warning", headline: "Every item imported so far has a description.", coverageNote: "The vault import is not full, so this is not the whole provider vault.", ...base };
}

export type CredentialView = { blocking: boolean; tone: Tone; headline: string; detail: string | null };
export function credentialView(status: VaultProcessingStatus | null | undefined): CredentialView {
  const state = status?.credential?.state;
  switch (state) {
    case "ok": return { blocking: false, tone: "complete", headline: "Description credential and budget are available.", detail: null };
    case "missing": return { blocking: true, tone: "problem", headline: "Description credential is missing. No new descriptions can run.", detail: "Ask an operator to add the describe key in secure settings. Nothing here can set it." };
    case "invalid": return { blocking: true, tone: "problem", headline: "Description credential was rejected. No new descriptions can run.", detail: "Ask an operator to replace the describe key in secure settings." };
    case "budget": return { blocking: true, tone: "problem", headline: "Description budget is exhausted. Processing is held.", detail: "It resumes after an operator raises or resets the budget, then choose Resume if paused." };
    case "unknown": return { blocking: true, tone: "warning", headline: "Description credential status is unreadable.", detail: "Treat description as blocked until this shows OK." };
    default: return { blocking: false, tone: "unknown", headline: "Description credential status is not reported.", detail: null };
  }
}

export type ProcessingControls = Record<"pause" | "resume" | "retry" | "redescribe", { enabled: boolean; why: string | null }>;
export function processingControls(status: VaultProcessingStatus | null | undefined, selectedIds: readonly string[], opts: { readOnly?: boolean; busy?: boolean } = {}): ProcessingControls {
  const lock = opts.readOnly ? "Read-only team access." : opts.busy ? "Another command is in progress." : !status ? "Status not loaded." : null;
  const paused = !!status?.paused, unresolved = status?.analysis?.unresolved ?? 0;
  return {
    pause: { enabled: !lock && !paused, why: lock ?? (paused ? "Already paused." : null) },
    resume: { enabled: !lock && paused, why: lock ?? (!paused ? "Not paused." : null) },
    retry: { enabled: !lock && unresolved > 0, why: lock ?? (unresolved > 0 ? null : "Nothing unresolved to retry.") },
    redescribe: { enabled: !lock && selectedIds.length >= 1 && selectedIds.length <= 200, why: lock ?? (selectedIds.length < 1 ? "Select media in the library first." : selectedIds.length > 200 ? "Select at most 200 items." : null) },
  };
}

export const processingActive = (status: VaultProcessingStatus | null | undefined, sync?: SyncLite | null) =>
  (status?.analysis ? status.analysis.queued + status.analysis.processing > 0 : false) || status?.import?.state === "in_progress" || sync?.status === "pending" || sync?.status === "running";
/** Polling delay (ms): quick while work is active, slow when idle, exponential backoff on errors and on unchanged active polls. */
export function processingPollDelay(opts: { active: boolean; failures: number; unchanged: number }): number {
  if (opts.failures > 0) return Math.min(60_000, (opts.active ? 4000 : 30_000) * 2 ** Math.min(opts.failures, 5));
  return opts.active ? Math.min(30_000, 4000 * 2 ** Math.min(opts.unchanged, 3)) : 30_000;
}

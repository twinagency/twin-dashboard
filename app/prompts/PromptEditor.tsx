"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info, inputCls, Modal } from "@/components/clone/fields";
import { validateTemplate, type ValidationIssue } from "@/lib/prompt-validate";
import { AGENT_TYPES, AGENT_LABELS, LIVE_WIRED_AGENT_TYPES, type AgentType, type TemplateRow, type VersionRow } from "@/lib/prompt-templates-shared";
import type { PromptPreview } from "@/lib/compiler";
import DiffView from "./DiffView";

type CloneLite = { id: string; name: string; status: "active" | "paused" };

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "notWired"; raw: string }
  | { status: "ready"; preview: PromptPreview };

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export default function PromptEditor({
  initialTemplates,
  clones,
}: {
  initialTemplates: TemplateRow[];
  clones: CloneLite[];
}) {
  const [templates, setTemplates] = useState<Record<AgentType, TemplateRow>>(() => {
    const map = {} as Record<AgentType, TemplateRow>;
    for (const t of initialTemplates) map[t.agent_type] = t;
    return map;
  });
  const [selected, setSelected] = useState<AgentType>("text");
  const [drafts, setDrafts] = useState<Partial<Record<AgentType, string>>>({});
  const [descDrafts, setDescDrafts] = useState<Partial<Record<AgentType, string>>>({});

  const [versionsByAgent, setVersionsByAgent] = useState<Partial<Record<AgentType, VersionRow[]>>>({});
  const [versionsLoading, setVersionsLoading] = useState(false);

  const [pendingSave, setPendingSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [serverIssues, setServerIssues] = useState<ValidationIssue[] | null>(null);

  const [pendingRestore, setPendingRestore] = useState<VersionRow | null>(null);
  const [restoring, setRestoring] = useState(false);

  const [lastChange, setLastChange] = useState<{ before: string; after: string; note: string } | null>(null);
  const [diffAgainst, setDiffAgainst] = useState<VersionRow | null>(null);

  const [previewCloneId, setPreviewCloneId] = useState<string>(clones.find((c) => c.status === "active")?.id ?? clones[0]?.id ?? "");
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });

  const current = templates[selected];
  const draft = drafts[selected] ?? current?.template ?? "";
  const descDraft = descDrafts[selected] ?? current?.description ?? "";
  const dirty = draft !== (current?.template ?? "") || descDraft !== (current?.description ?? "");
  const issues = useMemo(() => validateTemplate(draft), [draft]);
  const isLiveWired = LIVE_WIRED_AGENT_TYPES.has(selected);

  // Load version history for a tab the first time it's visited.
  useEffect(() => {
    if (versionsByAgent[selected]) return;
    let cancelled = false;
    setVersionsLoading(true);
    fetch(`/api/prompt-templates/versions?agentType=${selected}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.versions) setVersionsByAgent((prev) => ({ ...prev, [selected]: json.versions }));
      })
      .finally(() => !cancelled && setVersionsLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Switching tabs clears transient per-save UI from the previous tab.
  function switchTab(next: AgentType) {
    setSelected(next);
    setPendingSave(false);
    setPendingRestore(null);
    setDiffAgainst(null);
    setLastChange(null);
    setSaveError(null);
    setServerIssues(null);
    setPreview({ status: "idle" });
  }

  function setDraftText(text: string) {
    setDrafts((prev) => ({ ...prev, [selected]: text }));
    setServerIssues(null);
  }

  function discard() {
    setDrafts((prev) => ({ ...prev, [selected]: current?.template ?? "" }));
    setDescDrafts((prev) => ({ ...prev, [selected]: current?.description ?? "" }));
    setPendingSave(false);
  }

  async function doSave(opts?: { restoredFromVersion?: number }) {
    setSaving(true);
    setSaveError(null);
    setServerIssues(null);
    try {
      const res = await fetch("/api/prompt-templates/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentType: selected,
          template: draft,
          description: descDraft,
          restoredFromVersion: opts?.restoredFromVersion ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.issues) setServerIssues(json.issues);
        setSaveError(json.error ?? "save failed");
        return false;
      }
      const before = current?.template ?? "";
      setTemplates((prev) => ({ ...prev, [selected]: json.row }));
      setDrafts((prev) => ({ ...prev, [selected]: json.row.template }));
      setDescDrafts((prev) => ({ ...prev, [selected]: json.row.description ?? "" }));
      setVersionsByAgent((prev) => ({ ...prev, [selected]: [json.version, ...(prev[selected] ?? [])] }));
      setLastChange({
        before,
        after: json.row.template,
        note: opts?.restoredFromVersion
          ? `Restored version ${opts.restoredFromVersion} → now live as version ${json.version.version}.`
          : `Saved as version ${json.version.version}.`,
      });
      setPendingSave(false);
      setPendingRestore(null);
      setDiffAgainst(null);
      return true;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "save failed");
      return false;
    } finally {
      setSaving(false);
      setRestoring(false);
    }
  }

  // A restore IS a save — it just pulls its content from history instead of
  // the live textarea. Saved with restoredFromVersion set for provenance.
  async function confirmRestore(v: VersionRow) {
    setRestoring(true);
    setSaving(true);
    setSaveError(null);
    setServerIssues(null);
    try {
      const res = await fetch("/api/prompt-templates/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentType: selected,
          template: v.template,
          description: v.description ?? "",
          restoredFromVersion: v.version,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerIssues(json.issues ?? null);
        setSaveError(json.error ?? "restore failed");
        return;
      }
      const before = current?.template ?? "";
      setTemplates((prev) => ({ ...prev, [selected]: json.row }));
      // Clear any unsaved textarea edit — the editor now reflects what's live.
      setDrafts((prev) => ({ ...prev, [selected]: json.row.template }));
      setDescDrafts((prev) => ({ ...prev, [selected]: json.row.description ?? "" }));
      setVersionsByAgent((prev) => ({ ...prev, [selected]: [json.version, ...(prev[selected] ?? [])] }));
      setLastChange({ before, after: json.row.template, note: `Restored version ${v.version} → now live as version ${json.version.version}.` });
      setPendingRestore(null);
      setDiffAgainst(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "restore failed");
    } finally {
      setSaving(false);
      setRestoring(false);
    }
  }

  async function runPreview() {
    if (!previewCloneId) return;
    setPreview({ status: "loading" });
    try {
      const res = await fetch("/api/prompt-templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentType: selected, template: draft, cloneId: previewCloneId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPreview({ status: "error", message: json.error ?? "preview failed" });
        return;
      }
      if (json.notWired) setPreview({ status: "notWired", raw: json.raw });
      else setPreview({ status: "ready", preview: json.preview });
    } catch (e) {
      setPreview({ status: "error", message: e instanceof Error ? e.message : "preview failed" });
    }
  }

  const versions = versionsByAgent[selected] ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Prompt Templates</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Fleet-wide agent scaffolds. Every save writes a new version, nothing is ever destroyed, and any earlier version can be restored with one click.
        </p>
      </div>

      {/* ── Unmissable fleet-wide warning, always visible, not dismissible ── */}
      <div className="flex items-start gap-3 rounded-xl border border-crit/40 bg-crit/10 px-4 py-3">
        <span className="mt-0.5 text-lg">⚠️</span>
        <div className="text-sm text-ink">
          <span className="font-semibold text-crit">Fleet-wide.</span> Saving a template here changes what{" "}
          <span className="font-semibold">every clone</span> sends. There is no per-clone opt-out and no staging environment: the new prompt is live for
          the whole fleet within about 60 seconds of Save (the bot's template cache TTL).
        </div>
      </div>

      {/* ── Agent type tabs ── */}
      <div className="flex flex-wrap gap-1.5">
        {AGENT_TYPES.map((t) => {
          const isDirty = (drafts[t] !== undefined && drafts[t] !== templates[t]?.template) || (descDrafts[t] !== undefined && descDrafts[t] !== templates[t]?.description);
          return (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition " +
                (t === selected ? "border-accent bg-accent/10 text-accent" : "border-line bg-panel text-muted hover:text-ink")
              }
            >
              {AGENT_LABELS[t]}
              {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-warn" title="Unsaved changes" />}
              {!LIVE_WIRED_AGENT_TYPES.has(t) && (
                <span className="rounded-full bg-muted/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted">not wired</span>
              )}
            </button>
          );
        })}
      </div>

      {!isLiveWired && (
        <div className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink">
          <span className="mt-0.5">ⓘ</span>
          <div>
            <span className="font-semibold text-warn">This agent type is not wired into the bot runtime.</span>{" "}
            {selected === "media_match"
              ? "bot/src/flows/media.ts uses a hardcoded MATCH_PROMPT constant instead of reading this row."
              : "bot/src/services/voice-gen.ts uses a hardcoded VOICE_ENHANCER_PROMPT constant instead of reading this row."}{" "}
            Saving here changes nothing live until that code is updated to read this template. Editing is still validated and versioned normally.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── Editor column ── */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{AGENT_LABELS[selected]} template</CardTitle>
                {current && <span className="text-xs text-muted">updated {timeAgo(current.updated_at)}</span>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-xs text-muted">
                  Description
                  <Info text="Short internal note on what this scaffold is for. Not sent to the model." />
                </span>
                <input
                  className={inputCls}
                  value={descDraft}
                  onChange={(e) => setDescDrafts((prev) => ({ ...prev, [selected]: e.target.value }))}
                  placeholder="What this agent does"
                />
              </label>

              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-xs text-muted">
                  Template body
                  <Info text="{{SLOT}} markers get filled from her persona. {{#IF_X}}...{{/IF_X}} blocks are stripped in/out based on live clone toggles." />
                </span>
                <textarea
                  value={draft}
                  onChange={(e) => setDraftText(e.target.value)}
                  rows={22}
                  spellCheck={false}
                  className="w-full rounded-xl border border-line bg-panel px-3 py-2.5 font-mono text-xs leading-relaxed text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/30"
                />
              </label>

              {issues.length > 0 && (
                <div className="rounded-lg border border-crit/40 bg-crit/10 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-crit">
                    {issues.length} validation {issues.length === 1 ? "issue" : "issues"} — must be fixed before saving
                  </p>
                  <ul className="space-y-1 text-xs text-ink">
                    {issues.map((iss, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="shrink-0 text-crit">L{iss.line}</span>
                        <span>{iss.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {saveError && <p className="text-xs text-crit">{saveError}</p>}

              {!pendingSave ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    disabled={!dirty || issues.length > 0}
                    onClick={() => setPendingSave(true)}
                  >
                    Review &amp; save
                  </Button>
                  {dirty && (
                    <Button variant="outline" onClick={discard}>
                      Discard changes
                    </Button>
                  )}
                  {!dirty && <span className="text-xs text-muted">No unsaved changes.</span>}
                </div>
              ) : (
                <div className="space-y-3 rounded-lg border border-warn/40 bg-warn/10 p-3">
                  <p className="text-xs font-semibold text-ink">
                    Review before saving fleet-wide{isLiveWired ? " — this WILL change what every clone sends within ~60s." : "."}
                  </p>
                  <DiffView oldText={current?.template ?? ""} newText={draft} oldLabel={`Current (live)`} newLabel="Your draft" />
                  {serverIssues && serverIssues.length > 0 && (
                    <div className="rounded-lg border border-crit/40 bg-crit/10 p-2 text-xs text-crit">
                      Server rejected this save: {serverIssues.map((i) => i.message).join(" ")}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Button variant="destructive" disabled={saving} onClick={() => doSave()}>
                      {saving ? "Saving…" : "Confirm & save fleet-wide"}
                    </Button>
                    <Button variant="outline" disabled={saving} onClick={() => setPendingSave(false)}>
                      Keep editing
                    </Button>
                  </div>
                </div>
              )}

              {lastChange && (
                <div className="space-y-2 rounded-lg border border-good/40 bg-good/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-good">{lastChange.note}</p>
                    <button className="text-xs text-muted hover:text-ink" onClick={() => setLastChange(null)}>
                      dismiss
                    </button>
                  </div>
                  <p className="text-xs text-muted">What changed vs. the version you came from:</p>
                  <DiffView oldText={lastChange.before} newText={lastChange.after} oldLabel="Previous" newLabel="Now live" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Sidebar: live preview + version history ── */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Live preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted">
                The fully assembled prompt the bot would send, for a real clone, using your <span className="font-medium text-ink">unsaved draft</span>.
              </p>
              <select className={inputCls} value={previewCloneId} onChange={(e) => setPreviewCloneId(e.target.value)}>
                {clones.length === 0 && <option value="">No clones found</option>}
                {clones.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.status === "paused" ? "(paused)" : ""}
                  </option>
                ))}
              </select>
              <Button variant="outline" disabled={!previewCloneId || preview.status === "loading"} onClick={runPreview}>
                {preview.status === "loading" ? "Assembling…" : "Run preview"}
              </Button>

              {preview.status === "error" && <p className="text-xs text-crit">{preview.message}</p>}

              {preview.status === "notWired" && (
                <div>
                  <p className="mb-1 text-xs text-muted">Not wired into the runtime — this raw text is the entire preview:</p>
                  <textarea readOnly rows={10} value={preview.raw} className="w-full cursor-default rounded-lg border border-line bg-bg px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted outline-none" />
                </div>
              )}

              {preview.status === "ready" && (
                <div className="space-y-3">
                  <Badge variant="secondary">{preview.preview.mode === "smart" ? (preview.preview.smartSplit ? "Smart (writer + decider)" : "Smart (one model)") : "Classic"} flow</Badge>
                  {preview.preview.blocks.map((b) => (
                    <div key={b.key}>
                      <p className="mb-0.5 text-xs font-medium text-ink">{b.label}</p>
                      <p className="mb-1 text-[11px] text-muted">{b.hint}</p>
                      <textarea readOnly rows={7} value={b.content} className="w-full cursor-default rounded-lg border border-line bg-bg px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted outline-none" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Version history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {versionsLoading && !versions.length && <p className="text-xs text-muted">Loading…</p>}
              {!versionsLoading && versions.length === 0 && <p className="text-xs text-muted">No history yet.</p>}
              <ul className="space-y-2">
                {versions.map((v) => {
                  const isLive = v.template === current?.template;
                  const isDiffOpen = diffAgainst?.id === v.id;
                  return (
                    <li key={v.id} className="rounded-lg border border-line p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={isLive ? "default" : "outline"}>v{v.version}</Badge>
                          {isLive && <span className="text-[10px] font-semibold uppercase tracking-wide text-good">live</span>}
                          <span className="text-[11px] text-muted">{timeAgo(v.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button className="text-[11px] text-accent hover:underline" onClick={() => setDiffAgainst(isDiffOpen ? null : v)}>
                            {isDiffOpen ? "hide diff" : "diff"}
                          </button>
                          {!isLive && (
                            <button className="text-[11px] font-medium text-crit hover:underline" onClick={() => setPendingRestore(v)}>
                              restore
                            </button>
                          )}
                        </div>
                      </div>
                      {v.restored_from_version != null && (
                        <p className="mt-1 text-[10px] text-muted">restored from v{v.restored_from_version}</p>
                      )}
                      {v.description && <p className="mt-1 text-[11px] text-muted">{v.description}</p>}
                      {isDiffOpen && (
                        <div className="mt-2">
                          <DiffView oldText={v.template} newText={current?.template ?? ""} oldLabel={`v${v.version}`} newLabel="Current (live)" />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Restore confirmation, with the diff of what will change ── */}
      <Modal
        open={!!pendingRestore}
        onClose={() => setPendingRestore(null)}
        title={pendingRestore ? `Restore version ${pendingRestore.version}?` : ""}
        hint="This overwrites the current live template. It's saved as a brand new version, so this restore can itself be undone afterward."
      >
        {pendingRestore && (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              This overwrites the <span className="font-semibold">current live</span> {AGENT_LABELS[selected]} template
              {isLiveWired ? " fleet-wide, live within about 60 seconds." : "."}
            </p>
            <p className="text-xs font-medium text-muted">What will change (current live → version {pendingRestore.version}):</p>
            <DiffView oldText={current?.template ?? ""} newText={pendingRestore.template} oldLabel="Current (live)" newLabel={`v${pendingRestore.version}`} />
            <div className="flex items-center gap-2">
              <Button variant="destructive" disabled={restoring} onClick={() => confirmRestore(pendingRestore)}>
                {restoring ? "Restoring…" : "Confirm restore fleet-wide"}
              </Button>
              <Button variant="outline" disabled={restoring} onClick={() => setPendingRestore(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

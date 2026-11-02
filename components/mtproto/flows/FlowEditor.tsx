"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldLabel, Info, Toggle, inputCls, selectCls } from "@/components/clone/fields";
import { archiveFlowAction, createFlowAction, loadFlowPickerAction, saveFlowAction, setFlowEnabledAction } from "@/app/mtproto-campaign/flows/actions";
import {
  ACTION_LABEL,
  FLOW_ACTIONS,
  FLOW_WHEN,
  MAX_AFTER_MINUTES,
  MAX_FLOW_STEPS,
  MAX_FREE_MEDIA_ITEMS,
  MAX_PAID_OFFERS,
  MAX_TEXT_CHARS,
  MAX_TEXT_LINES,
  MIN_AFTER_MINUTES,
  WHEN_LABEL,
  validateFlowSteps,
  type Flow,
  type FlowActionType,
  type FlowWhen,
} from "@/lib/mtproto/flow-steps";
import type { FlowStats, StepStats } from "@/lib/mtproto/flows";
import { clearRefs, draftsToSteps, hasRefs, moveStep, newDraftStep, stepToDraft, type DraftStep } from "@/lib/mtproto/flow-draft";
import type { FlowPicker, PickerMedia } from "@/lib/mtproto/flow-media";
import type { CreatorLite } from "@/lib/mtproto/types";
import { Notice, Panel, StatusPill } from "../kit";
import { num } from "../view";

const TRIGGER_TIP: Record<FlowWhen, string> = {
  reply: "Runs on the fan's next real message after the opener.",
  yes: "Runs when the fan's next message is a yes or asks for more. Anything else is answered by the normal chat and the flow keeps waiting, for at most 3 messages.",
  after_minutes: `Runs this many minutes after the previous step was sent, only while the fan is still inside the 24 hour window. 1 to ${MAX_AFTER_MINUTES}.`,
  purchased: "Runs after the fan pays for something following the previous step.",
};

function MediaGrid({ items, picked, onToggle, disabled }: { items: PickerMedia[]; picked: string[]; onToggle: (id: string) => void; disabled: boolean }) {
  if (items.length === 0) return <div className="text-xs text-muted">None found for this girl.</div>;
  return (
    <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
      {items.map((m) => {
        const on = picked.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            title={m.label}
            disabled={disabled && !on}
            onClick={() => onToggle(m.id)}
            className={`relative aspect-square overflow-hidden rounded-lg border text-left text-[10px] leading-tight transition ${on ? "border-accent-2 ring-2 ring-accent-2/40" : "border-line hover:bg-muted/10"} ${disabled && !on ? "opacity-40" : ""}`}
          >
            {m.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt={m.label} className="size-full object-cover" loading="lazy" />
            ) : (
              <span className="block p-1 text-muted">{m.label}</span>
            )}
            {on && <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-accent-2 text-[10px] font-bold text-white">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

function StepStatsRow({ s }: { s: StepStats | undefined }) {
  const v = s ?? { sent: 0, failed: 0, purchased: 0, stars: 0 };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/5 px-3 py-1.5 text-xs text-muted">
      <span className="flex items-center gap-1">
        Sent <b className="tabular-nums text-ink">{num(v.sent)}</b>
        <Info text="How many fans received this step." />
      </span>
      <span>
        Bought <b className="tabular-nums text-ink">{num(v.purchased)}</b>
      </span>
      <span>
        Stars <b className="tabular-nums text-good">{num(v.stars)}</b>
      </span>
      {v.failed > 0 && (
        <span>
          Failed <b className="tabular-nums text-crit">{num(v.failed)}</b>
        </span>
      )}
    </div>
  );
}

export default function FlowEditor({
  flow,
  creators,
  initialPicker,
  stats,
  globalOn,
}: {
  flow: Flow | null;
  creators: CreatorLite[];
  initialPicker: FlowPicker;
  stats: FlowStats | null;
  globalOn: boolean | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(flow?.name ?? "");
  const [cloneId, setCloneId] = useState(flow?.cloneId ?? "");
  const [steps, setSteps] = useState<DraftStep[]>(flow ? flow.steps.map(stepToDraft) : [newDraftStep([])]);
  const [picker, setPicker] = useState<FlowPicker>(initialPicker);
  const [enabled, setEnabled] = useState(flow?.enabled ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const isNew = flow === null;
  const archived = flow?.archived === true;
  const tied = cloneId !== "";

  const dirty = () => setSaved(null);
  const patch = (i: number, p: Partial<DraftStep>) => {
    dirty();
    setSteps((prev) => prev.map((s, k) => (k === i ? { ...s, ...p } : s)));
  };
  const addAfter = (i: number) => {
    if (steps.length >= MAX_FLOW_STEPS) return;
    dirty();
    setSteps((prev) => {
      const out = [...prev];
      out.splice(i + 1, 0, newDraftStep(prev));
      return out;
    });
  };
  const remove = (i: number) => {
    dirty();
    setSteps((prev) => prev.filter((_, k) => k !== i));
  };
  const move = (i: number, dir: -1 | 1) => {
    dirty();
    setSteps((prev) => moveStep(prev, i, dir));
  };

  const changeGirl = (next: string) => {
    if (next === cloneId) return;
    if (hasRefs(steps) && !window.confirm("Changing the girl clears the media and offers picked in this flow. Continue?")) return;
    dirty();
    setCloneId(next);
    setSteps((prev) => prev.map(clearRefs));
    setPicker({ photos: [], videos: [], bundles: [], sequences: [], error: null });
    if (!next) return;
    startTransition(async () => {
      const r = await loadFlowPickerAction(next);
      if (r.ok) setPicker(r.picker);
      else setError(r.error);
    });
  };

  const paid = steps.filter((s) => s.actionType === "bundle_offer" || s.actionType === "sequence_offer").length;

  const submit = () => {
    setError(null);
    setSaved(null);
    let payload: unknown[];
    try {
      payload = draftsToSteps(steps);
      validateFlowSteps(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "check the steps");
      return;
    }
    const fd = new FormData();
    fd.set("name", name);
    fd.set("cloneId", cloneId);
    fd.set("steps", JSON.stringify(payload));
    if (flow) fd.set("flowId", flow.id);
    startTransition(async () => {
      try {
        if (isNew) {
          const r = await createFlowAction(fd);
          if (!r.ok) return setError(r.error);
          router.push(`/mtproto-campaign/flows/${r.id}`);
        } else {
          const r = await saveFlowAction(fd);
          if (!r.ok) return setError(r.error);
          setSaved("Saved.");
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "save failed");
      }
    });
  };

  const toggleEnabled = (want: boolean) => {
    if (!flow) return;
    setError(null);
    const fd = new FormData();
    fd.set("flowId", flow.id);
    fd.set("enabled", String(want));
    startTransition(async () => {
      const r = await setFlowEnabledAction(fd);
      if (!r.ok) return setError(r.error);
      setEnabled(r.enabled);
      router.refresh();
    });
  };

  const archive = () => {
    if (!flow || !window.confirm("Archive this flow? It is switched off and hidden. Runs already using it keep their copy.")) return;
    const fd = new FormData();
    fd.set("flowId", flow.id);
    startTransition(async () => {
      const r = await archiveFlowAction(fd);
      if (!r.ok) return setError(r.error);
      router.push("/mtproto-campaign/flows");
    });
  };

  const globalOff = globalOn !== true;
  const toggleHint = archived
    ? "An archived flow cannot be turned on."
    : globalOff
      ? globalOn === null
        ? "The global flows switch could not be read, so flows cannot be turned on."
        : "The global flows switch is Off, so no flow can be turned on yet. That switch is set outside this page."
      : "Both this switch and the global switch must be on for fans to enter this flow. Fans already in a flow keep the steps they started with.";

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/mtproto-campaign/flows" className="text-sm font-semibold text-accent-2 hover:underline">
          ← All flows
        </Link>
        {archived && <StatusPill tone="warn">archived</StatusPill>}
      </div>

      <Panel title="Flow" tip="A flow is what happens after a fan replies to an MTProto opener. Only the opener goes out from the creator's own Telegram account. Every step after it is sent by the normal bot, inside the 24 hour window the reply opened.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <FieldLabel label="Name" hint="Only you see this." />
            <input type="text" value={name} maxLength={80} disabled={archived} onChange={(e) => (dirty(), setName(e.target.value))} placeholder="e.g. Riley reply then bundle" className={inputCls} />
          </label>
          <label className="block">
            <FieldLabel label="Girl" hint="A flow tied to one girl can use her photos, videos, bundles and video parts. Any girl means a text-only template that any run can use." />
            <select value={cloneId} disabled={archived} onChange={(e) => changeGirl(e.target.value)} className={selectCls}>
              <option value="">Any girl (text and hand-back only)</option>
              {creators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!isNew && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <Toggle label={enabled ? "Enabled" : "Disabled"} name="enabled" checked={enabled} onChange={toggleEnabled} hint={toggleHint} disabled={pending || archived || (globalOff && !enabled)} />
            <StatusPill tone={globalOn === true ? "good" : "neutral"} title="App setting mtproto_flows_enabled, read only here">
              Global switch: {globalOn === null ? "unknown" : globalOn ? "On" : "Off"}
            </StatusPill>
          </div>
        )}
        {stats && !isNew && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-xs text-muted">
            <span>Entered <b className="tabular-nums text-ink">{num(stats.enrolled)}</b></span>
            <span>Replied <b className="tabular-nums text-ink">{num(stats.replied)}</b></span>
            <span>Finished <b className="tabular-nums text-ink">{num(stats.completed)}</b></span>
            <span>Stopped <b className="tabular-nums text-ink">{num(stats.stopped)}</b></span>
            <span>Stars <b className="tabular-nums text-good">{num(stats.stars)}</b></span>
            {stats.truncated && <span className="text-warn">counts are a lower bound</span>}
          </div>
        )}
      </Panel>

      {steps.length === 0 && (
        <div className="rounded-xl border border-dashed border-line p-6 text-center">
          <Button type="button" variant="outline" disabled={archived} onClick={() => addAfter(-1)}>
            + Add step
          </Button>
        </div>
      )}

      {steps.map((s, i) => {
        const needsGirl = s.actionType === "free_media" || s.actionType === "bundle_offer" || s.actionType === "sequence_offer";
        const mediaCount = s.photoIds.length + s.videoIds.length;
        const toggleMedia = (key: "photoIds" | "videoIds", id: string) => {
          const cur = s[key];
          patch(i, { [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } as Partial<DraftStep>);
        };
        return (
          <div key={s.id} className="space-y-2">
            <Panel
              title={`Step ${i + 1}`}
              actions={
                <div className="flex items-center gap-1 text-xs">
                  <button type="button" disabled={i === 0 || archived} onClick={() => move(i, -1)} className="rounded-md px-2 py-1 font-semibold text-muted hover:bg-muted/10 disabled:opacity-30" aria-label="Move step up">
                    ↑ Up
                  </button>
                  <button type="button" disabled={i === steps.length - 1 || archived} onClick={() => move(i, 1)} className="rounded-md px-2 py-1 font-semibold text-muted hover:bg-muted/10 disabled:opacity-30" aria-label="Move step down">
                    ↓ Down
                  </button>
                  <button type="button" disabled={archived} onClick={() => remove(i)} className="rounded-md px-2 py-1 font-semibold text-crit hover:bg-crit/10 disabled:opacity-30">
                    Remove
                  </button>
                </div>
              }
            >
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <FieldLabel label="When" hint={TRIGGER_TIP[s.when]} />
                    <select value={s.when} disabled={archived} onChange={(e) => patch(i, { when: e.target.value as FlowWhen })} className={selectCls}>
                      {FLOW_WHEN.map((w) => (
                        <option key={w} value={w}>
                          {WHEN_LABEL[w]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <FieldLabel label="Do" hint="What the bot does at this step. Hand back ends the flow and the normal chat takes over. A flow also ends by itself after its last step." />
                    <select value={s.actionType} disabled={archived} onChange={(e) => patch(i, { actionType: e.target.value as FlowActionType })} className={selectCls}>
                      {FLOW_ACTIONS.map((a) => (
                        <option key={a} value={a}>
                          {ACTION_LABEL[a]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {s.when === "after_minutes" && (
                  <label className="block max-w-xs">
                    <FieldLabel label="Minutes later" hint={`Whole minutes after the previous step, ${MIN_AFTER_MINUTES} to ${MAX_AFTER_MINUTES}. It has to stay inside the 24 hour window.`} />
                    <input type="number" min={MIN_AFTER_MINUTES} max={MAX_AFTER_MINUTES} step={1} value={s.afterMinutes} disabled={archived} onChange={(e) => patch(i, { afterMinutes: e.target.value })} className={inputCls} />
                  </label>
                )}

                {s.actionType === "text" && (
                  <div>
                    <div className="mb-1 flex items-center gap-1 text-xs text-muted">
                      Lines
                      <Info text={`Each fan gets one of these lines, picked at random. Up to ${MAX_TEXT_LINES} lines, ${MAX_TEXT_CHARS} characters each. No links and no dashes.`} />
                    </div>
                    <div className="space-y-2">
                      {s.lines.map((l, k) => (
                        <div key={k} className="flex items-center gap-2">
                          <input type="text" value={l} maxLength={MAX_TEXT_CHARS} disabled={archived} placeholder="Add a line" onChange={(e) => patch(i, { lines: s.lines.map((x, j) => (j === k ? e.target.value : x)) })} className={inputCls} />
                          <button type="button" disabled={s.lines.length <= 1 || archived} onClick={() => patch(i, { lines: s.lines.filter((_, j) => j !== k) })} className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-crit hover:bg-crit/10 disabled:opacity-30" aria-label="Remove line">
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    {s.lines.length < MAX_TEXT_LINES && (
                      <button type="button" disabled={archived} onClick={() => patch(i, { lines: [...s.lines, ""] })} className="mt-2 text-xs font-semibold text-accent-2 hover:underline">
                        + Add a line
                      </button>
                    )}
                  </div>
                )}

                {needsGirl && !tied && (
                  <Notice tone="info">Pick a girl above to choose her media and offers. A flow for any girl can only send text.</Notice>
                )}

                {s.actionType === "free_media" && tied && (
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 flex items-center gap-1 text-xs text-muted">
                        Photos
                        <Info text={`Free to the fan. Pick 1 to ${MAX_FREE_MEDIA_ITEMS} items in total across photos and videos.`} />
                        <span className="ml-auto tabular-nums">{mediaCount}/{MAX_FREE_MEDIA_ITEMS} picked</span>
                      </div>
                      <MediaGrid items={picker.photos} picked={s.photoIds} onToggle={(id) => toggleMedia("photoIds", id)} disabled={archived || mediaCount >= MAX_FREE_MEDIA_ITEMS} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-muted">Videos</div>
                      <MediaGrid items={picker.videos} picked={s.videoIds} onToggle={(id) => toggleMedia("videoIds", id)} disabled={archived || mediaCount >= MAX_FREE_MEDIA_ITEMS} />
                    </div>
                    <label className="block">
                      <FieldLabel label="Caption (optional)" hint="Sent with the media. No links and no dashes." />
                      <input type="text" value={s.caption} maxLength={MAX_TEXT_CHARS} disabled={archived} onChange={(e) => patch(i, { caption: e.target.value })} className={inputCls} />
                    </label>
                  </div>
                )}

                {s.actionType === "bundle_offer" && tied && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <FieldLabel label="Bundle" hint="Sent locked. The price is the bundle's own price, set in Media." />
                      <select value={s.bundleId} disabled={archived} onChange={(e) => patch(i, { bundleId: e.target.value })} className={selectCls}>
                        <option value="">Choose a bundle</option>
                        {picker.bundles.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                            {b.starPrice != null ? ` (${b.starPrice} Stars)` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <FieldLabel label="Caption (optional)" hint="Shown with the locked bundle. No links and no dashes." />
                      <input type="text" value={s.caption} maxLength={MAX_TEXT_CHARS} disabled={archived} onChange={(e) => patch(i, { caption: e.target.value })} className={inputCls} />
                    </label>
                  </div>
                )}

                {s.actionType === "sequence_offer" && tied && (
                  <label className="block max-w-md">
                    <FieldLabel label="Video sequence" hint="Offers the parts of one recording as a preview plus paid parts, using the existing video sequence offer." />
                    <select value={s.sequenceId} disabled={archived} onChange={(e) => patch(i, { sequenceId: e.target.value })} className={selectCls}>
                      <option value="">Choose a sequence</option>
                      {picker.sequences.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {s.actionType === "handoff" && <div className="text-xs text-muted">Nothing is sent. The normal chat takes over from here.</div>}
              </div>
            </Panel>
            {!isNew && <StepStatsRow s={stats?.steps[i]} />}
            <div className="flex justify-center">
              <button type="button" disabled={steps.length >= MAX_FLOW_STEPS || archived} onClick={() => addAfter(i)} className="rounded-full border border-dashed border-line px-4 py-1 text-xs font-semibold text-accent-2 hover:bg-muted/10 disabled:opacity-40">
                + Add step
              </button>
            </div>
          </div>
        );
      })}

      {paid > MAX_PAID_OFFERS && (
        <Notice tone="warn">
          Only the first {MAX_PAID_OFFERS} paid offers are sent to each fan. The extra offer steps are skipped.
        </Notice>
      )}
      {steps.length >= MAX_FLOW_STEPS && <div className="text-xs text-muted">Maximum {MAX_FLOW_STEPS} steps.</div>}
      {picker.error && <Notice tone="warn">Some of this girl&apos;s media could not be loaded: {picker.error}</Notice>}
      {error && <Notice tone="crit">{error}</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" className="h-10 rounded-xl px-5" onClick={submit} disabled={pending || archived}>
          {pending ? "Working…" : isNew ? "Create flow" : "Save changes"}
        </Button>
        {saved && <span className="text-sm font-semibold text-good">{saved}</span>}
        {!isNew && !archived && (
          <Button type="button" size="lg" variant="outline" className="ml-auto h-10 rounded-xl px-5" onClick={archive} disabled={pending}>
            Archive
          </Button>
        )}
      </div>
    </form>
  );
}

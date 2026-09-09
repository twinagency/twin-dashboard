"use client";

import { useMemo, useState } from "react";
import { inputCls } from "@/components/clone/fields";
import { Info } from "@/components/clone/fields";
import { Button } from "@/components/ui/button";
import {
  descriptionIsInherited,
  manifestBlockers,
  type PartDraft,
  type RevisionState,
} from "@/lib/sequence-policy";
import { MIN_PAID_MEDIA_PRICE_STARS } from "@/lib/pricing";

type Props = {
  state: RevisionState;
  editable: boolean;
  editBlocker: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  sourceCaption: string | null;
  sourceDurationSeconds: number | null;
  initialParts: PartDraft[];
  saveAction: (fd: FormData) => Promise<void>;
};

function secondsToClock(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const total = Math.floor(value);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Renumber so the preview is 0 and paid parts run 1, 2, 3 in list order, and
 *  each part depends on the one before it unless the reviewer cleared that. */
function renumber(parts: PartDraft[]): PartDraft[] {
  let paid = 0;
  return parts.map((p) => {
    const position = p.isPreview ? 0 : ++paid;
    const requires = p.requiresPosition === null ? null : position > 1 ? position - 1 : null;
    return { ...p, position, requiresPosition: requires };
  });
}

export default function SequenceEditor({
  state, editable, editBlocker, approvedBy, approvedAt,
  sourceCaption, sourceDurationSeconds, initialParts, saveAction,
}: Props) {
  const [parts, setParts] = useState<PartDraft[]>(() => renumber([...initialParts].sort((a, b) => a.position - b.position)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // manifestBlockers, not publishBlockers: this panel lists what the reviewer
  // can fix in this editor. Whether a person has approved the cut, and whether
  // the renderer has produced the clips, are steps that happen after this
  // screen is saved, and listing them here would read as an error in the cut.
  const blockers = useMemo(() => manifestBlockers(parts, sourceCaption), [parts, sourceCaption]);

  function update(index: number, patch: Partial<PartDraft>) {
    setParts((current) => renumber(current.map((p, i) => (i === index ? { ...p, ...patch } : p))));
  }

  function addClip() {
    const last = parts[parts.length - 1];
    const start = last ? last.sourceEndSeconds : 0;
    setParts((current) => renumber([...current, {
      position: 0, isPreview: false, caption: null, priceStars: null,
      sourceStartSeconds: start, sourceEndSeconds: start + 60, requiresPosition: null,
    }]));
  }

  function remove(index: number) {
    setParts((current) => renumber(current.filter((_, i) => i !== index)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= parts.length) return;
    setParts((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return renumber(next);
    });
  }

  /** Absorb the following clip into this one, so the reviewer can undo a cut
   *  without retyping both time ranges. */
  function combineWithNext(index: number) {
    if (index >= parts.length - 1) return;
    setParts((current) => {
      const merged = { ...current[index], sourceEndSeconds: current[index + 1].sourceEndSeconds };
      return renumber(current.filter((_, i) => i !== index + 1).map((p, i) => (i === index ? merged : p)));
    });
  }

  /** Exactly one clip is the free preview, and it is always the first. */
  function setPreview(index: number) {
    setParts((current) => renumber(current.map((p, i) => {
      if (i === index) return { ...p, isPreview: !p.isPreview, priceStars: !p.isPreview ? null : p.priceStars };
      return { ...p, isPreview: false };
    }).sort((a, b) => Number(b.isPreview) - Number(a.isPreview))));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("parts", JSON.stringify(parts));
      await saveAction(fd);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the clip list");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {!editable && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
          {editBlocker}
        </div>
      )}

      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">Clips</h2>
        <Info text="Each clip is sold on its own. Position 0 is the optional free preview, paid parts run from 1. Times are seconds into the source recording." />
        <span className="ml-auto text-xs text-muted">
          {sourceDurationSeconds ? `Source runs ${secondsToClock(sourceDurationSeconds)}` : "Source length unknown"}
        </span>
      </div>

      <div className="space-y-3">
        {parts.map((part, index) => {
          const inherited = descriptionIsInherited(part.caption, sourceCaption);
          return (
            <div key={index} className="rounded-xl border border-line bg-panel p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${part.isPreview ? "bg-accent-2/15 text-ink" : "bg-muted/15 text-ink"}`}>
                  {part.isPreview ? "Free preview" : `Part ${part.position}`}
                </span>
                <span className="text-xs text-muted">
                  {secondsToClock(part.sourceStartSeconds)} to {secondsToClock(part.sourceEndSeconds)}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Button type="button" variant="outline" size="sm" disabled={!editable} onClick={() => setPreview(index)}>
                    {part.isPreview ? "Make paid" : "Make preview"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={!editable || index === 0} onClick={() => move(index, -1)}>Up</Button>
                  <Button type="button" variant="outline" size="sm" disabled={!editable || index === parts.length - 1} onClick={() => move(index, 1)}>Down</Button>
                  <Button type="button" variant="outline" size="sm" disabled={!editable || index === parts.length - 1} onClick={() => combineWithNext(index)}>
                    Combine
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={!editable} onClick={() => remove(index)}>Remove</Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs text-muted">Start (seconds)</span>
                  <input type="number" min={0} step={0.1} className={inputCls} disabled={!editable}
                    value={part.sourceStartSeconds}
                    onChange={(e) => update(index, { sourceStartSeconds: Number(e.target.value) })} />
                </label>
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs text-muted">End (seconds)</span>
                  <input type="number" min={0} step={0.1} className={inputCls} disabled={!editable}
                    value={part.sourceEndSeconds}
                    onChange={(e) => update(index, { sourceEndSeconds: Number(e.target.value) })} />
                </label>
                <label className="block min-w-0">
                  <span className="mb-1 flex items-center gap-1 text-xs text-muted">
                    Price (Stars)
                    <Info text={`A paid part costs at least ${MIN_PAID_MEDIA_PRICE_STARS} Stars. The free preview cannot be priced.`} />
                  </span>
                  <input type="number" min={MIN_PAID_MEDIA_PRICE_STARS} step={1} className={inputCls}
                    disabled={!editable || part.isPreview}
                    value={part.priceStars ?? ""}
                    placeholder={part.isPreview ? "Free" : String(MIN_PAID_MEDIA_PRICE_STARS)}
                    onChange={(e) => update(index, { priceStars: e.target.value === "" ? null : Number(e.target.value) })} />
                </label>
              </div>

              <label className="mt-2 block min-w-0">
                <span className="mb-1 flex items-center gap-1 text-xs text-muted">
                  What is in this clip
                  <Info text="Describe only what a fan sees in this clip. Something that happens elsewhere in the recording is not evidence it appears here, and the bot will promise whatever this says." />
                </span>
                <input type="text" className={inputCls} disabled={!editable}
                  value={part.caption ?? ""}
                  placeholder="she opens the door and looks back over her shoulder"
                  onChange={(e) => update(index, { caption: e.target.value })} />
              </label>
              {inherited && (
                <p className="mt-1 text-xs text-crit">
                  This is the source recording&apos;s description. Describe this clip specifically.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={addClip} disabled={!editable}>Add clip</Button>
        <Button type="button" onClick={submit} disabled={!editable || saving}>
          {saving ? "Saving" : "Save clip list"}
        </Button>
      </div>

      {error && <div className="rounded-xl border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-ink">{error}</div>}

      <div className="rounded-xl border border-line bg-panel p-3">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">Before this can go live</h3>
          <Info text="Publication is blocked until every item here is cleared. After that a person approves the cut, the renderer cuts the clips, and publication is the last step." />
        </div>
        {blockers.length === 0 ? (
          <p className="text-sm text-good">Ready to approve and render.</p>
        ) : (
          <ul className="space-y-1 text-sm text-ink">
            {blockers.map((b) => <li key={b} className="flex gap-2"><span className="text-warn">-</span><span>{b}</span></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

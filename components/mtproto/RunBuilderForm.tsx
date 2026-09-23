"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FieldLabel, inputCls, selectCls } from "@/components/clone/fields";
import { Info } from "@/components/clone/fields";
import { previewAudienceAction, createRunAction } from "@/app/mtproto-campaign/actions";
import {
  DEFAULT_DAILY_CAP,
  DEFAULT_HOLDOUT_PCT,
  DEFAULT_REENGAGEMENT_VARIANTS,
  MAX_MESSAGE_VARIANTS,
  HARD_MAX_DAILY_CAP,
  HOLDOUT_MAX_PCT,
  HOLDOUT_MIN_PCT,
  PREVIEW_EXCLUSION_REASONS,
  RUN_SEGMENTS,
  type AudiencePreview,
  type CreatorLite,
} from "@/lib/mtproto/types";
import { CreatorAvatar, EmptyBlock, Notice, Skeleton, StatusPill, StepHeading } from "./kit";
import { exclusion, num } from "./view";

const SEGMENT_LABEL: Record<(typeof RUN_SEGMENTS)[number], string> = {
  all_silent: "All silent fans",
  top_spenders: "Top spenders",
  lapsed_buyers: "Lapsed buyers (bought before, gone quiet)",
  never_bought: "Never bought",
};

function StepCard({ children }: { children: React.ReactNode }) {
  return <Card className="gap-4 border border-line p-4 sm:p-5">{children}</Card>;
}

function Stat({ label, sub, value, tone = "text-ink" }: { label: string; sub: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line p-3 text-center">
      <div className={`font-heading text-2xl font-semibold tabular-nums ${tone}`}>{num(value)}</div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-muted/80">{sub}</div>
    </div>
  );
}

// Run builder as three plain steps: pick creators, set limits, preview and
// create. Preview is read-only. Creating always starts as a DRY RUN: nothing is
// sent, and going live is a separate, later step on the run's own page. All
// limits are re-validated server-side; this form only collects them.
export default function RunBuilderForm({ creators }: { creators: CreatorLite[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [working, setWorking] = useState<"preview" | "create" | null>(null);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dailyCap, setDailyCap] = useState(String(DEFAULT_DAILY_CAP));
  const [holdout, setHoldout] = useState(String(DEFAULT_HOLDOUT_PCT));

  const toggle = (id: string) => {
    setPreview(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = (on: boolean) => {
    setPreview(null);
    setSelected(on ? new Set(creators.map((c) => c.id)) : new Set());
  };

  const runPreview = () => {
    setError(null);
    setWorking("preview");
    const fd = new FormData(formRef.current!);
    startTransition(async () => {
      try {
        const result = await previewAudienceAction(fd);
        if (!result.ok) {
          setError(result.error);
          setPreview(null);
          return;
        }
        setPreview(result.preview);
      } catch (e) {
        setError(e instanceof Error ? e.message : "preview failed");
        setPreview(null);
      } finally {
        setWorking(null);
      }
    });
  };

  const createRun = () => {
    setError(null);
    setWorking("create");
    const fd = new FormData(formRef.current!);
    startTransition(async () => {
      try {
        const result = await createRunAction(fd);
        if (!result.ok) {
          setError(result.error);
          setWorking(null);
          return;
        }
        router.push(`/mtproto-campaign/runs/${result.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "create run failed");
        setWorking(null);
      }
    });
  };

  const capN = Number(dailyCap);
  const holdN = Number(holdout);
  const capOk = Number.isInteger(capN) && capN >= 1 && capN <= HARD_MAX_DAILY_CAP;
  const holdOk = Number.isFinite(holdN) && holdN >= HOLDOUT_MIN_PCT && holdN <= HOLDOUT_MAX_PCT;

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} onChange={() => setPreview(null)} className="mx-auto max-w-3xl space-y-4">
      <Notice tone="info" title="Nothing is sent from this page.">
        Preview only reads. Creating a run always starts as a dry run, a rehearsal. Going live is a separate step later, with its own typed confirmation.
      </Notice>

      {/* STEP 1 */}
      <StepCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StepHeading n={1} title="Pick creators" tip="Choose whose silent fans to message. Each message is sent from that creator's own Telegram account. Caps and the hold-out apply to each creator separately." done={selected.size > 0} />
          {creators.length > 1 && (
            <div className="flex items-center gap-1 text-xs">
              <button type="button" onClick={() => selectAll(true)} className="rounded-md px-2 py-1 font-semibold text-accent-2 hover:bg-muted/10">Select all</button>
              <button type="button" onClick={() => selectAll(false)} className="rounded-md px-2 py-1 font-semibold text-muted hover:bg-muted/10">Clear</button>
            </div>
          )}
        </div>
        {creators.length === 0 ? (
          <EmptyBlock icon="◌" title="No creators found" hint="A run needs at least one creator." />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {creators.map((c) => {
              const on = selected.has(c.id);
              return (
                <label
                  key={c.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-sm transition ${on ? "border-accent-2 bg-accent-2/5 ring-2 ring-accent-2/20" : "border-line hover:bg-muted/5"}`}
                >
                  <input type="checkbox" name="cloneIds" value={c.id} checked={on} onChange={() => toggle(c.id)} className="size-4 accent-[var(--color-accent-2)]" />
                  <CreatorAvatar id={c.id} name={c.name} className="size-8 text-xs" />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{c.name}</span>
                  {c.status === "paused" && <StatusPill tone="warn">paused</StatusPill>}
                </label>
              );
            })}
          </div>
        )}
        <div className="text-xs text-muted">{selected.size === 0 ? "None picked yet." : `${selected.size} creator${selected.size === 1 ? "" : "s"} picked.`}</div>
      </StepCard>

      {/* STEP 2 */}
      <StepCard>
        <StepHeading n={2} title="Set limits" tip="Who counts as a silent fan, and how many of them may be messaged. The safety caps here are checked again by the server before anything is saved." done={selected.size > 0 && capOk && holdOk} />

        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Who to message</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <FieldLabel label="Which fans" hint="Start with All silent fans. Top spenders and Lapsed buyers narrow it to people who have paid before." />
              <select name="segment" defaultValue="all_silent" className={selectCls}>
                {RUN_SEGMENTS.map((s) => (
                  <option key={s} value={s}>
                    {SEGMENT_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <FieldLabel label="Spent at least (Stars)" hint="Leave empty to include everyone. Only fans who spent at least this many Stars in total are chosen." />
              <input type="number" min={0} name="minSpendStars" placeholder="any amount" className={inputCls} />
            </label>
            <label className="block">
              <FieldLabel label="Silent for at least (days)" hint="How long a fan must have gone quiet. 1 means at least a day since their last message. Fans who wrote in the last 24 hours are never messaged." />
              <input type="number" min={1} defaultValue={1} name="lastActiveFromDays" className={inputCls} />
            </label>
            <label className="block">
              <FieldLabel label="Silent for at most (days)" hint="Optional. Set it to skip fans who have been gone a very long time." />
              <input type="number" min={1} name="lastActiveToDays" placeholder="no limit" className={inputCls} />
            </label>
            <label className="block">
              <FieldLabel label="Language" hint="Optional two-letter code such as en. Empty means every language." />
              <input type="text" name="language" placeholder="en" className={inputCls} />
            </label>
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">How many</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <FieldLabel label="Daily cap per creator" hint={`The most messages one creator's account sends in a day. Default ${DEFAULT_DAILY_CAP}. Lower is safer for the account. Between 1 and ${HARD_MAX_DAILY_CAP}.`} />
              <input type="number" min={1} max={HARD_MAX_DAILY_CAP} step={1} value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} name="dailyCap" className={inputCls} />
            </label>
            <label className="block">
              <FieldLabel label="Whole-run cap per creator" hint="Optional. A hard ceiling on the total one creator sends over the entire run, however many days it takes." />
              <input type="number" min={1} max={10000} step={1} name="runCap" placeholder="no limit" className={inputCls} />
            </label>
            <label className="block">
              <FieldLabel label={`Hold-out % (${HOLDOUT_MIN_PCT} to ${HOLDOUT_MAX_PCT})`} hint="The share of chosen fans deliberately NOT messaged. Comparing them with the messaged fans is the only honest way to tell whether the messages worked." />
              <input type="number" min={HOLDOUT_MIN_PCT} max={HOLDOUT_MAX_PCT} step={1} value={holdout} onChange={(e) => setHoldout(e.target.value)} name="holdoutPct" className={inputCls} />
            </label>
          </div>
          <div className="mt-3 rounded-xl bg-muted/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
            {selected.size === 0 ? (
              <span className="text-muted">Pick a creator to see what these limits mean.</span>
            ) : capOk && holdOk ? (
              <>
                At most <span className="font-semibold">{num(capN * selected.size)}</span> messages on day one ({capN} for each of {selected.size} creator{selected.size === 1 ? "" : "s"}). About{" "}
                <span className="font-semibold">{holdN}%</span> of chosen fans are held back to compare against.
              </>
            ) : (
              <span className="text-crit">
                {!capOk ? `Daily cap must be a whole number from 1 to ${HARD_MAX_DAILY_CAP}. ` : ""}
                {!holdOk ? `Hold-out must be from ${HOLDOUT_MIN_PCT} to ${HOLDOUT_MAX_PCT}.` : ""}
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <div className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            Re-engagement message variants
            <Info text="These are the approved openers for this campaign. One is selected deterministically per fan, so retries and the dry-to-live replay keep the same wording for that fan." />
          </div>
          <div className="space-y-2">
            {Array.from({ length: MAX_MESSAGE_VARIANTS }, (_, i) => (
              <label key={i} className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Variant {i + 1}</span>
                <input
                  type="text"
                  name="messageVariants"
                  maxLength={280}
                  defaultValue={DEFAULT_REENGAGEMENT_VARIANTS[i] ?? ""}
                  placeholder={i === 0 ? "Add a message" : "Optional"}
                  className={inputCls}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Leave any unused lines blank. At least one message is required. The worker still applies its final safety validation before any send.
          </p>
        </div>
      </StepCard>

      {/* STEP 3 */}
      <StepCard>
        <StepHeading n={3} title="Preview, then create" tip="Preview shows who this would reach and who would be left out, without saving or sending anything. Then create the run: it starts as a dry run." done={!!preview} />

        {error && <Notice tone="crit">{error}</Notice>}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="lg" variant="outline" className="h-10 rounded-xl px-5" onClick={runPreview} disabled={pending || selected.size === 0}>
            {working === "preview" ? "Working…" : preview ? "Preview again" : "Preview who this reaches"}
          </Button>
          <Button type="button" size="lg" className="h-10 rounded-xl px-5" onClick={createRun} disabled={pending || !preview}>
            {working === "create" ? "Creating…" : "Create dry run"}
          </Button>
          <span className="text-xs text-muted">{selected.size === 0 ? "Pick a creator first." : !preview ? "Preview first, then create." : "Nothing is sent when you create."}</span>
        </div>

        {working === "preview" ? (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !preview ? (
          <EmptyBlock icon="◎" title="No preview yet" hint="Pick creators, check the limits, then press Preview. It costs nothing and writes nothing." />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Matched" sub="fit your filters" value={preview.candidatePool} />
              <Stat label="Will be messaged" sub="passed every check" value={preview.eligible} tone="text-good" />
              <Stat label="Held back" sub="left alone to compare" value={preview.holdout} />
            </div>

            {preview.truncated && <Notice tone="warn">The candidate read hit its row ceiling, so the counts here are a lower bound.</Notice>}

            {preview.pausedCreators.length > 0 && (
              <Notice tone="crit" title={`Paused creators: not sent (${preview.pausedNotSent} fans)`}>
                <ul className="mt-1 space-y-1">
                  {preview.pausedCreators.map((p) => (
                    <li key={p.cloneId} className="flex flex-wrap justify-between gap-x-3">
                      <span>
                        {creators.find((c) => c.id === p.cloneId)?.name ?? p.cloneId}{" "}
                        <span className="text-xs font-semibold text-crit">{p.autoHalted ? "AUTO-HALTED" : "paused"}: not sent</span>
                      </span>
                      <span className="tabular-nums text-muted">{p.notSent} fans skipped</span>
                    </li>
                  ))}
                </ul>
              </Notice>
            )}

            <section>
              <h3 className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                Why fans were left out ({num(preview.excludedTotal)})
                <Info text="Every fan who matched but will not be messaged has exactly one reason. These are safety and fairness rules, not errors." />
              </h3>
              {preview.excludedTotal === 0 ? (
                <div className="text-sm text-muted">Nobody was left out.</div>
              ) : (
                <ul className="divide-y divide-line rounded-2xl border border-line">
                  {PREVIEW_EXCLUSION_REASONS.filter((r) => preview.excluded[r] > 0).map((r) => {
                    const ex = exclusion(r);
                    return (
                      <li key={r} className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
                        <span className="flex min-w-0 items-center gap-1 text-ink">
                          <span className="truncate">{ex.label}</span>
                          <Info text={ex.why} />
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-ink">{num(preview.excluded[r])}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                A few of the fans who would be messaged
                <Info text="A small sample, so you can sanity check who is in the audience. Spend tier is how much they have paid us so far." />
              </h3>
              {preview.sample.length === 0 ? (
                <div className="text-sm text-muted">No eligible fans yet.</div>
              ) : (
                <ul className="divide-y divide-line rounded-2xl border border-line">
                  {preview.sample.map((f) => (
                    <li key={f.userId} className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
                      <span className="min-w-0 truncate text-ink">{f.name ?? `Fan ${f.telegramId}`}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {f.spendTier ?? "no tier"} · <span className="font-semibold text-good">{f.totalSpentStars} ⭐</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </StepCard>
    </form>
  );
}

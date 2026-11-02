import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info } from "@/components/clone/fields";
import {
  FLOW_GROUP_LABEL,
  SPEND_PROVIDERS,
  SPEND_WINDOWS,
  fmtCents,
  fmtPct,
  fmtTokens,
  fmtUsd,
  getSpendData,
  type FlowGroup,
  type SpendProvider,
  type SpendWindow,
} from "@/lib/spend-data";

// ── Spend: where the AI money actually goes ──────────────────────────────────
// Lives INSIDE /logs as the "Spend" tab (operator ask, 2026-08-14: not its own
// nav item - a sub-section of Logs, one click deeper). READ ONLY. Every number
// comes from lib/spend-data.ts (paged read of usage_events + a HEAD count of
// chat_history); nothing here writes.
//
// Scoped by the SAME clone as the rest of /logs (the header switcher, or a
// ?clone= override from a per-fan link) - passed in as a prop, not read here.

const GROUP_ORDER: FlowGroup[] = ["live", "background", "overhead", "unattributed"];

const GROUP_HINT: Record<FlowGroup, string> = {
  live: "A fan sent something and is waiting for the reply. Text, voice, photo, video, spoil, bundle, vision and VIP routes.",
  background:
    "Nobody is waiting on these. Drip, followups, campaigns, free previews, onboarding and star reconcile all spend money on their own schedule.",
  overhead:
    "Paid on top of every turn, before or after the reply itself. Routing, media match, safety, profile extract, image moderation, voice enhance and name capture.",
  unattributed:
    "The call was logged before flow labelling shipped, or the bot could not name the reason. Never guessed into another bucket, so this shrinks on its own as older rows age out of the window.",
};

const GROUP_TONE: Record<FlowGroup, string> = {
  live: "text-good",
  background: "text-warn",
  overhead: "text-accent",
  unattributed: "text-muted",
};

function spendHref(w: SpendWindow, p: SpendProvider): string {
  const params = new URLSearchParams({ view: "spend" });
  if (w !== "today") params.set("w", w);
  if (p !== "all") params.set("src", p);
  return `/logs?${params.toString()}`;
}

function Pills({ active, provider }: { active: SpendWindow; provider: SpendProvider }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full bg-elev p-1">
      {SPEND_WINDOWS.map((w) => (
        <a
          key={w.key}
          href={spendHref(w.key, provider)}
          className={
            "rounded-full px-3 py-1 text-xs font-medium transition " +
            (w.key === active ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")
          }
        >
          {w.label}
        </a>
      ))}
    </div>
  );
}

// The filter Ronan asked for, 2026-08-14: three different billers (OpenRouter
// for every LLM call, ElevenLabs for voice, Deepgram for transcription) were
// rolled into one dollar figure, which made "why is OPENROUTER burning money"
// unanswerable from the page that exists to answer exactly that.
function ProviderPills({ active, window: win }: { active: SpendProvider; window: SpendWindow }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-full bg-elev p-1">
      {SPEND_PROVIDERS.map((p) => (
        <a
          key={p.key}
          href={spendHref(win, p.key)}
          className={
            "rounded-full px-3 py-1 text-xs font-medium transition " +
            (p.key === active ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")
          }
        >
          {p.label}
        </a>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  hint,
  tone = "",
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1 text-xs text-muted">
        {label}
        {hint && <Info text={hint} />}
      </div>
      <div className={"mt-1 font-mono text-2xl font-semibold tabular-nums " + tone}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </Card>
  );
}

/** A share bar that reads as one number plus its slice of the whole. */
function Share({ share, color }: { share: number; color: string }) {
  return (
    <span className="inline-flex h-1.5 w-16 overflow-hidden rounded-full bg-elev align-middle">
      <span className={"h-full rounded-full " + color} style={{ width: `${Math.min(100, share * 100)}%` }} />
    </span>
  );
}

function GroupBadge({ group }: { group: FlowGroup }) {
  return (
    <span className={"text-[10px] font-medium uppercase tracking-wide " + GROUP_TONE[group]}>
      {FLOW_GROUP_LABEL[group]}
    </span>
  );
}

export async function SpendView({
  window: win,
  cloneId,
  provider,
}: {
  window: SpendWindow;
  cloneId: string | null;
  provider: SpendProvider;
}) {
  const data = await getSpendData(win, cloneId, provider);

  const { totals, cache } = data;
  const scopedName = cloneId ? data.clones[0]?.name ?? null : null;
  const providerLabel = SPEND_PROVIDERS.find((p) => p.key === provider)?.label ?? "All";

  return (
    <div className="dashboard-page text-ink">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/90 p-3 shadow-[var(--shadow-card)] backdrop-blur-xl">
        <div>
          <h1 className="font-heading text-lg font-semibold">AI spend</h1>
          <p className="text-xs text-muted">
            {scopedName ? (
              <>
                <span className="creator-name">{scopedName}</span> only
              </>
            ) : (
              "All creators"
            )}{" "}
            · {provider === "all" ? "every model, every flow, every girl" : `${providerLabel} only`}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProviderPills active={provider} window={win} />
          <Pills active={win} provider={provider} />
        </div>
      </div>

      {data.truncated && (
        <Card className="mb-4 border-warn/40 p-4">
          <div className="text-sm font-medium text-warn">This window was too big to read in full</div>
          <p className="mt-1 text-sm text-muted">
            The paged read stopped at its row ceiling, so every total on this page is a lower bound, not a total. Pick a
            shorter window, or scope to one creator with the switcher.
          </p>
        </Card>
      )}

      {/* ── headline ───────────────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Total AI spend"
          value={fmtUsd(totals.costUsd)}
          sub={`${totals.calls.toLocaleString()} calls · ${totals.errors.toLocaleString()} failed`}
          hint="Every logged LLM, voice and transcription call in the window, including calls we could not attribute to a creator. Failed calls are counted here too because a failed call still bills."
        />
        <Stat
          label="Cost per fan message"
          value={fmtCents(totals.costPerFanMessageUsd)}
          sub={`${totals.fanMessages.toLocaleString()} fan messages`}
          tone="text-good"
          hint="Total AI spend divided by the number of messages fans actually sent in this window. The one number that says whether things are getting cheaper. Shown in cents because a single message costs a fraction of one."
        />
        <Stat
          label="Per-turn overhead"
          value={fmtUsd(totals.byGroup.overhead)}
          sub={`${fmtPct(totals.costUsd > 0 ? totals.byGroup.overhead / totals.costUsd : null)} of spend`}
          tone="text-accent"
          hint={GROUP_HINT.overhead}
        />
        <Stat
          label="Background sends"
          value={fmtUsd(totals.byGroup.background)}
          sub={`${fmtPct(totals.costUsd > 0 ? totals.byGroup.background / totals.costUsd : null)} of spend`}
          tone="text-warn"
          hint={GROUP_HINT.background}
        />
      </div>

      {/* ── where it goes, four buckets ────────────────────────────────────── */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center gap-1 text-sm font-medium">
          Where the money goes
          <Info text="Every flow label the bot writes falls into exactly one of these four. Unattributed is never folded into the others, a wrong label would be worse than none." />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GROUP_ORDER.map((g) => {
            const cost = totals.byGroup[g];
            const share = totals.costUsd > 0 ? cost / totals.costUsd : 0;
            return (
              <div key={g} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center gap-1">
                  <GroupBadge group={g} />
                  <Info text={GROUP_HINT[g]} />
                </div>
                <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{fmtUsd(cost)}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                  <Share share={share} color={g === "live" ? "bg-good" : g === "background" ? "bg-warn" : g === "overhead" ? "bg-accent" : "bg-muted"} />
                  {fmtPct(totals.costUsd > 0 ? share : null)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── cost per girl ──────────────────────────────────────────────────── */}
      <Card className="mb-4 p-0">
        <div className="flex items-center gap-1 px-4 pt-4 text-sm font-medium">
          Cost per girl
          <Info text="Ranked most expensive first. The four bucket columns add up to the total. A girl with no calls in the window still appears, at zero." />
        </div>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Creator</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Live</TableHead>
                <TableHead className="text-right">Background</TableHead>
                <TableHead className="text-right">Overhead</TableHead>
                <TableHead className="text-right">Unattributed</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Per fan msg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.clones.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                      <span className="creator-name font-medium">{c.name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-semibold">{fmtUsd(c.costUsd)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-good">{fmtUsd(c.byGroup.live)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-warn">{fmtUsd(c.byGroup.background)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-accent">{fmtUsd(c.byGroup.overhead)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted">{fmtUsd(c.byGroup.unattributed)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted">{c.calls.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtCents(c.costPerFanMessageUsd)}</TableCell>
                </TableRow>
              ))}
              {data.clones.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-sm text-muted">
                    No creators.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── cost per flow, fleet-wide ──────────────────────────────────────── */}
      <Card className="mb-4 p-0">
        <div className="flex items-center gap-1 px-4 pt-4 text-sm font-medium">
          Cost per flow{scopedName ? `, ${scopedName}` : ", fleet-wide"}
          <Info text="The exact flow labels the bot writes, straight from bot/src/services/usage.ts. Text against voice against photo against vision, plus every background job and every piece of overhead." />
        </div>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flow</TableHead>
                <TableHead>Bucket</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Avg / call</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byFlow.map((f) => (
                <TableRow key={f.flow ?? "__null"}>
                  <TableCell className="font-mono text-xs">{f.label}</TableCell>
                  <TableCell>
                    <GroupBadge group={f.group} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-semibold">{fmtUsd(f.costUsd)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted">{f.calls.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted">
                    {fmtUsd(f.calls > 0 ? f.costUsd / f.calls : 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="flex items-center justify-end gap-2 font-mono text-xs tabular-nums text-muted">
                      <Share share={f.share} color="bg-accent" />
                      {(f.share * 100).toFixed(1)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {data.byFlow.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted">
                    No AI calls in this window.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── per girl, per flow ─────────────────────────────────────────────── */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center gap-1 text-sm font-medium">
          Per girl, per flow
          <Info text="The same flow cut, one girl at a time. Open a girl to see which of her flows the money went to." />
        </div>
        <div className="space-y-2">
          {data.clones
            .filter((c) => c.byFlow.length > 0)
            .map((c) => (
              <details key={c.id} className="rounded-xl border border-line bg-surface px-3 py-2">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="creator-name font-medium">{c.name}</span>
                    <span className="text-[11px] text-muted">{c.byFlow.length} flows</span>
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums">{fmtUsd(c.costUsd)}</span>
                </summary>
                <div className="mt-2 space-y-1 border-t border-line pt-2">
                  {c.byFlow.map((f) => (
                    <div key={f.flow ?? "__null"} className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-2">
                        <span className="font-mono">{f.label}</span>
                        <GroupBadge group={f.group} />
                      </span>
                      <span className="flex items-center gap-3 font-mono tabular-nums">
                        <span className="text-muted">{f.calls.toLocaleString()} calls</span>
                        <span className="w-20 text-right font-semibold">{fmtUsd(f.costUsd)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          {data.clones.every((c) => c.byFlow.length === 0) && (
            <p className="py-2 text-sm text-muted">No attributed calls for any creator in this window.</p>
          )}
        </div>
      </Card>

      {/* ── models ─────────────────────────────────────────────────────────── */}
      <Card className="mb-4 p-0">
        <div className="flex flex-wrap items-center gap-1 px-4 pt-4 text-sm font-medium">
          Every model in use
          <Info text="Every model id that billed in this window, whether or not any creator is configured to use it. Two are hardcoded in bot code and appear in no dashboard config: openai/gpt-4.1-mini is the LLM fallback and openai/gpt-5-mini does image moderation. Anything flagged Not configured is spend you never chose." />
          {data.unconfiguredModels.length > 0 && (
            <span className="ml-2 rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn">
              {data.unconfiguredModels.length} not configured by any creator
            </span>
          )}
        </div>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Avg / call</TableHead>
                <TableHead className="text-right">Prompt</TableHead>
                <TableHead className="text-right">Output</TableHead>
                <TableHead className="text-right">Cache hit</TableHead>
                <TableHead className="text-right">Cache saved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byModel.map((m) => (
                <TableRow key={m.model}>
                  <TableCell>
                    <span className="flex flex-col">
                      <span className="font-mono text-xs">{m.model}</span>
                      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted">
                        {m.kind ?? "unknown"}
                        {!m.configured && <span className="font-medium text-warn">Not configured</span>}
                        {m.errors > 0 && <span className="font-medium text-crit">{m.errors} failed</span>}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums font-semibold">{fmtUsd(m.costUsd)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted">{m.calls.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted">
                    {fmtUsd(m.calls > 0 ? m.costUsd / m.calls : 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted">{fmtTokens(m.promptTokens)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted">{fmtTokens(m.completionTokens)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    <span className={m.cache.hitRate == null ? "text-muted" : "text-good"}>{fmtPct(m.cache.hitRate)}</span>
                    {m.cache.hitRate != null && (
                      <span className="block text-[10px] text-muted">{m.cache.reportingCalls.toLocaleString()} calls reported</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-good">{fmtUsd(m.cache.discountUsd)}</TableCell>
                </TableRow>
              ))}
              {data.byModel.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-sm text-muted">
                    No AI calls in this window.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── cache ──────────────────────────────────────────────────────────── */}
      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center gap-1 text-sm font-medium">
          Prompt cache
          <Info text="Providers bill cached prompt input at a fraction of fresh input, so on the biggest line item here the useful number is how much of the prompt was already cached. Only calls where the provider actually reported cache figures are counted. A provider that reports nothing is left out entirely rather than counted as a zero hit, otherwise every non-caching model would drag this to zero and make a working cache look broken." />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="text-xs text-muted">Fleet hit rate</div>
            <div className={"mt-1 font-mono text-xl font-semibold tabular-nums " + (cache.hitRate == null ? "text-muted" : "text-good")}>
              {fmtPct(cache.hitRate)}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">of prompt tokens, on reporting calls</div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="text-xs text-muted">Tokens served from cache</div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{fmtTokens(cache.cachedPromptTokens)}</div>
            <div className="mt-0.5 text-[11px] text-muted">of {fmtTokens(cache.reportingPromptTokens)} reported</div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="text-xs text-muted">Written into cache</div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{fmtTokens(cache.cacheWriteTokens)}</div>
            <div className="mt-0.5 text-[11px] text-muted">free on OpenRouter</div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center gap-1 text-xs text-muted">
              Saved by the cache
              <Info text="Already deducted inside the total spend above. This is attribution of a discount you have already received, not an extra credit to subtract again." />
            </div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-good">{fmtUsd(cache.discountUsd)}</div>
            <div className="mt-0.5 text-[11px] text-muted">{cache.reportingCalls.toLocaleString()} calls reported cache data</div>
          </div>
        </div>
      </Card>

      <p className="pb-6 text-[11px] text-muted">
        Window {new Date(data.startIso).toLocaleString()} to {new Date(data.endIso).toLocaleString()}. Read only, from
        usage_events. Failed calls are included because they still bill.
      </p>
    </div>
  );
}

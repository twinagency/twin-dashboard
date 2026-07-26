"use client";

import type { SimEvent } from "@/lib/test-runs";

// Renders one run's transcript, event by event, in emission order (fan
// message, then whatever she sent back that turn). Used both for a live SSE
// feed (events grows in place) and for a finished history row (events is the
// full array from the DB, static).

type MetaEvent = SimEvent & {
  clone?: { id: string; slug: string; name: string; aiMode: string };
  persona?: string;
  turns?: number;
  fanId?: number;
};

type BotEvent = SimEvent & {
  turn?: number;
  kind?: string;
  text?: string;
  effect?: boolean;
  audioFile?: string | null;
  caption?: string | null;
  transcript?: string | null;
  paid?: boolean;
  stars?: number;
  count?: number;
  options?: string;
  storagePath?: string | null;
};

function BotBubble({ ev, runId }: { ev: BotEvent; runId: string }) {
  const base = "max-w-[80%] rounded-2xl rounded-tr-sm border px-3 py-2 text-sm";
  switch (ev.kind) {
    case "text":
      return (
        <div className={`${base} border-accent/30 bg-accent/10 text-ink`}>
          {String(ev.text ?? "")}
          {ev.effect ? <span className="ml-1">✨</span> : null}
        </div>
      );
    case "reaction":
      return <div className="self-end text-lg">{String(ev.text ?? "")}</div>;
    case "system":
      return <div className="self-end text-xs italic text-muted">{String(ev.text ?? "")}</div>;
    case "voice":
      return (
        <div className={`${base} border-purple-500/30 bg-purple-500/10 text-ink`}>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">🎤 voice note</div>
          {ev.audioFile ? (
            <audio controls preload="none" className="h-8 w-56 max-w-full">
              <source src={`/api/test-run/${runId}/media/${ev.audioFile}`} type="audio/ogg" />
            </audio>
          ) : null}
          {ev.transcript ? <div className="mt-1 text-xs text-muted">&ldquo;{ev.transcript}&rdquo;</div> : null}
          {ev.caption ? <div className="mt-1 text-xs text-muted">{ev.caption}</div> : null}
        </div>
      );
    case "photo":
    case "video": {
      const locked = !!ev.paid;
      return (
        <div className={`${base} min-w-0 ${locked ? "border-warn/40 bg-warn/10" : "border-good/40 bg-good/10"} text-ink`}>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
            {locked ? `🔒 locked ${ev.kind} · ${ev.stars}⭐` : `🎁 free ${ev.kind}`}
          </div>
          {ev.storagePath ? (
            ev.kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/test-run/thumb?path=${encodeURIComponent(ev.storagePath)}`}
                alt=""
                className={`mb-1 max-h-48 rounded-lg object-cover ${locked ? "blur-md" : ""}`}
              />
            ) : (
              <video
                src={`/api/test-run/thumb?path=${encodeURIComponent(ev.storagePath)}`}
                className={`mb-1 max-h-48 rounded-lg ${locked ? "blur-md" : ""}`}
                muted
                controls={!locked}
              />
            )
          ) : null}
          {ev.caption ? <div className="truncate text-xs text-muted">{ev.caption}</div> : null}
        </div>
      );
    }
    case "bundle":
      return (
        <div className={`${base} border-warn/40 bg-warn/10 text-ink`}>
          <div className="mb-1 text-xs font-medium text-muted">🔒 locked bundle · {ev.count} pics · {ev.stars}⭐</div>
          {ev.caption ? <div className="text-xs text-muted">{ev.caption}</div> : null}
        </div>
      );
    case "paywall":
      return (
        <div className={`${base} border-crit/40 bg-crit/10 text-ink`}>
          <div className="mb-1 text-xs font-medium text-crit">💳 paywall · {ev.count} msgs / {ev.stars}⭐</div>
          {String(ev.text ?? "")}
        </div>
      );
    case "tip_menu":
      return (
        <div className={`${base} border-pink-500/40 bg-pink-500/10 text-ink`}>
          <div className="mb-1 text-xs font-medium text-pink-500">💖 tip menu · {ev.options}</div>
          {String(ev.text ?? "")}
        </div>
      );
    case "tip":
      return (
        <div className={`${base} border-pink-500/40 bg-pink-500/10 text-ink`}>
          <div className="mb-1 text-xs font-medium text-pink-500">💖 tip button · {ev.stars}⭐</div>
          {String(ev.text ?? "")}
        </div>
      );
    case "vip":
      return (
        <div className={`${base} border-cyan-400/40 bg-cyan-400/10 text-ink`}>
          <div className="mb-1 text-xs font-medium text-cyan-400">💎 VIP{ev.options ? ` · ${ev.options}` : ` · ${ev.stars}⭐/mo`}</div>
          {String(ev.text ?? "")}
        </div>
      );
    default:
      return <div className={`${base} border-line bg-panel text-muted`}>{JSON.stringify(ev)}</div>;
  }
}

export default function RunThread({ runId, events, compact = false }: { runId: string; events: SimEvent[]; compact?: boolean }) {
  const meta = events.find((e) => e.t === "meta") as MetaEvent | undefined;
  const done = events.find((e) => e.t === "done") as (SimEvent & { summary?: Record<string, unknown> }) | undefined;
  const errors = events.filter((e) => e.t === "error") as (SimEvent & { turn?: number; message?: string })[];

  return (
    <div className={`flex flex-col gap-2 ${compact ? "" : "min-h-0"}`}>
      {meta && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-2 text-xs text-muted">
          <span className="min-w-0 truncate font-medium text-ink">{meta.clone?.name}</span>
          <span>persona: {String(meta.persona)}</span>
          <span>turns: {String(meta.turns)}</span>
          <span>fan id: {String(meta.fanId)}</span>
        </div>
      )}

      <div className="flex flex-col gap-2 overflow-y-auto">
        {events.map((ev, i) => {
          if (ev.t === "fan") {
            const f = ev as SimEvent & { text?: string };
            return (
              <div key={i} className="flex flex-col items-start">
                <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-line bg-bg px-3 py-2 text-sm text-ink">
                  {String(f.text ?? "")}
                </div>
              </div>
            );
          }
          if (ev.t === "bot") {
            return (
              <div key={i} className="flex flex-col items-end">
                <BotBubble ev={ev as BotEvent} runId={runId} />
              </div>
            );
          }
          if (ev.t === "error") {
            const e = ev as SimEvent & { turn?: number; message?: string };
            return (
              <div key={i} className="self-center rounded-md border border-crit/40 bg-crit/10 px-2 py-1 text-xs text-crit">
                turn {e.turn}: {e.message}
              </div>
            );
          }
          return null;
        })}
      </div>

      {done && (
        <div className="mt-1 flex flex-wrap gap-2 border-t border-line pt-2 text-xs text-muted">
          {Object.entries(done.summary ?? {}).map(([k, v]) => (
            <span key={k} className="rounded-full border border-line bg-bg px-2 py-0.5">
              {k}: {String(v)}
            </span>
          ))}
        </div>
      )}
      {!done && errors.length > 0 && (
        <div className="text-xs text-crit">{errors.length} error{errors.length === 1 ? "" : "s"} so far</div>
      )}
    </div>
  );
}

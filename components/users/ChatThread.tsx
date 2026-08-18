"use client";

import { useEffect, useRef, useState } from "react";
import { onLive, isTyping } from "@/lib/live-bus";

// The Fans inbox message thread, rebuilt 2026-08-18 to Ronan's brief: match
// Telegram "almost 1:1", open on the NEWEST message rather than the oldest,
// draw a rule where the latest message starts, render the buttons the fan
// actually saw, and say under every bubble which flow produced it.
//
// WHY THIS IS A CLIENT COMPONENT AND THE OLD VERSION WAS NOT: three of those
// are impossible server side. Opening pinned to the bottom needs a layout
// effect on the scroll container; the live status line needs the SSE bus; and
// "today / yesterday" day pills need the viewer's clock, which server rendering
// would resolve on the box's clock instead and hydrate differently.
//
// Everything expensive still happens on the server. The page resolves media to
// signed URLs, parses `meta`, matches purchases, groups the runs and FORMATS
// EVERY DATE, then hands this component a flat, already-decided list.
//
// THE DATES ARE FORMATTED SERVER SIDE ON PURPOSE, and this cost a real bug on
// the first run of this component: `toLocaleTimeString(undefined, ...)` resolved
// to "20:47" under Node and "8:47 pm" in the browser, so every single bubble
// hydration-mismatched and React threw the whole tree away and re-rendered it on
// the client. Any Date work in here re-introduces that. The rest of this page
// has always rendered its dates server side (`ago`, `dateTime` in page.tsx), so
// this also keeps one clock across the screen instead of two.

export type ThreadButton = { text: string; kind?: string | null };

export type ThreadMessage = {
  id: string;
  /** true = the fan wrote it (left, white). false = she sent it (right, green). */
  fan: boolean;
  content: string;
  /** Formatted on the SERVER. See the hydration note in the header. */
  timeLabel: string;
  /** Set only on the first message of a day, already formatted. */
  dayLabel: string | null;
  /** First / last of a Telegram-style run of same-side messages. */
  startsRun: boolean;
  endsRun: boolean;
  kind: "text" | "voice" | "photo" | "video" | "bundle";
  voiceUrl?: string | null;
  transcript?: string | null;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaCount?: number | null;
  /** Locked/paid media at send time. */
  paid?: boolean;
  stars?: number | null;
  caption?: string | null;
  /** He owns this item: a star_transactions row names this media_id. */
  purchased?: boolean;
  purchasedStars?: number | null;
  /** Whether "no purchase found" can be TRUSTED for this bubble. False when the
      fan has any media purchase that does not name its item (every purchase
      before migration 121, and every bundle purchase ever, since a bundle's
      Star charge carries no uuid). When false the bubble shows the price it was
      offered at and claims nothing about whether he paid. */
  lockKnown?: boolean;
  /** Provenance. Absent means UNKNOWN, never "this was a live reply" - nothing
      recorded a flow before the bot started stamping it, so an old row has no
      label and must not be given one. */
  flowLabel?: string | null;
  flowEmoji?: string | null;
  flowHint?: string | null;
  /** Inline keyboard as the fan saw it, rows of buttons. */
  buttons?: ThreadButton[][] | null;
  /** Campaign marker drawn ABOVE this bubble, already deduped server side so a
      win-back firing a media send and a text send under one step number draws
      one rule, not two. Null on every row that is not the first of its step. */
  dripMarker?: { label: string; hint: string } | null;
};

// Telegram's double tick. Nothing here knows whether a fan actually read a
// message (the Bot API never tells us), so this is "delivered", one tick, and
// there is deliberately no blue read tick to invent.
function Tick() {
  return (
    <svg viewBox="0 0 16 11" className="h-3 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="M1 6.2 4.2 9.4 10.6 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ChatThread({
  fanId,
  messages,
  lastActiveLabel,
  spentStars,
  purchasedCount,
}: {
  fanId: string;
  messages: ThreadMessage[];
  lastActiveLabel: string;
  spentStars: number;
  purchasedCount: number;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [typing, setTyping] = useState(false);

  // Open on the newest message. Ronan's #1 complaint: the thread used to render
  // oldest-first into a scroll box that starts at the top, so picking a fan
  // showed a conversation from days ago and the operator had to scroll to find
  // out what just happened. Jumped, not smooth-scrolled - a 60-message animated
  // scroll on every fan click reads as a bug.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [fanId, messages.length]);

  useEffect(() => {
    setTyping(isTyping(fanId));
    return onLive((event) => {
      if (event.t === "typing" && event.fanId === fanId) setTyping(event.typing);
    });
  }, [fanId]);

  const lastIndex = messages.length - 1;

  return (
    <>
      <div ref={scrollRef} className="tg-thread flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="tg-daypill">No messages yet</span>
          </div>
        ) : (
          messages.map((m, i) => {
            const isText = m.kind === "text";

            return (
              <div key={m.id}>
                {m.dayLabel && (
                  <div className="my-3 flex justify-center">
                    <span className="tg-daypill">{m.dayLabel}</span>
                  </div>
                )}

                {/* Automated campaign marker. Kept from the previous panel, and
                    kept SEPARATE from the flow pill below: this one exists for
                    every drip row already in the database (stamped since
                    2026-08-17), where the flow pill only exists for rows written
                    since 2026-08-18. Folding the two together would have made
                    every historic drip send look un-automated. */}
                {m.dripMarker && (
                  <div className="my-2.5 flex items-center gap-2" title={m.dripMarker.hint}>
                    <span className="h-px flex-1 bg-white/35" />
                    <span className="tg-daypill inline-flex items-center gap-1">
                      <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" strokeLinecap="round" />
                      </svg>
                      {m.dripMarker.label}
                    </span>
                    <span className="h-px flex-1 bg-white/35" />
                  </div>
                )}

                {/* The rule Ronan asked for: something that marks where the most
                    recent message is, so an endless scroll has a visible end. */}
                {i === lastIndex && messages.length > 1 && (
                  <div className="tg-newline my-2 -mx-3">
                    <span className="h-px flex-1 bg-white/40" />
                    latest message
                    <span className="h-px flex-1 bg-white/40" />
                  </div>
                )}

                <div className={"flex " + (m.fan ? "justify-start" : "justify-end") + (m.startsRun ? " mt-2" : " mt-0.5")}>
                  <div className="flex max-w-[78%] flex-col items-stretch gap-1">
                    <div
                      className={
                        "tg-bubble " +
                        (m.fan ? "tg-bubble-in " : "tg-bubble-out ") +
                        (m.endsRun ? (m.fan ? "tg-tail-in" : "tg-tail-out") : "")
                      }
                    >
                      {m.kind === "voice" && m.voiceUrl ? (
                        <>
                          <audio controls preload="none" className="h-9 w-60 max-w-full" src={m.voiceUrl} />
                          {m.transcript && (
                            <div className="mt-1 whitespace-pre-wrap text-[13px] italic opacity-70">“{m.transcript}”</div>
                          )}
                        </>
                      ) : m.kind === "voice" ? (
                        <div className="flex items-start gap-2">
                          <span className="text-xl leading-none">🎙</span>
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold opacity-80">Voice message</span>
                            {m.transcript && (
                              <span className="block whitespace-pre-wrap text-[13px] italic opacity-70">“{m.transcript}”</span>
                            )}
                          </span>
                        </div>
                      ) : !isText ? (
                        <>
                          {m.mediaUrl ? (
                            m.kind === "video" ? (
                              <video
                                src={m.mediaUrl}
                                muted
                                playsInline
                                preload="metadata"
                                className="h-48 w-56 max-w-full rounded-lg object-cover"
                              />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.mediaUrl} alt={m.mediaName ?? ""} className="h-48 w-56 max-w-full rounded-lg object-cover" />
                            )
                          ) : (
                            <div className="flex h-24 w-56 max-w-full items-center justify-center rounded-lg bg-black/5 text-3xl">
                              {m.kind === "video" ? "🎥" : m.kind === "bundle" ? "🎁" : "📷"}
                            </div>
                          )}
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="min-w-0 truncate text-xs font-semibold">
                              {m.mediaName ?? (m.kind === "bundle" ? "Bundle" : m.kind === "video" ? "Video" : "Photo")}
                              {m.kind === "bundle" && m.mediaCount ? ` · ${m.mediaCount} pics` : ""}
                            </span>
                            {/* Three distinct states, and the difference is the
                                whole point of this row: FREE, sent-locked-and-
                                still-locked, and sent-locked-and-HE-PAID. The old
                                panel only ever showed the price it was offered
                                at, so "what did this fan actually buy" could not
                                be read off the thread at all. */}
                            {/* FOUR states, and the fourth is the honest one.
                                "Locked" is a claim that he did NOT pay, and that
                                claim is only safe when every media purchase this
                                fan has made names the item it bought. Where it
                                does not (anything before migration 121, and
                                every bundle, whose Star charge carries no uuid
                                at all) the bubble shows the price it was offered
                                at and says nothing about payment, which is
                                exactly what the old panel did. Showing "locked"
                                over something he actually bought would be worse
                                than showing nothing. */}
                            {m.purchased ? (
                              <span
                                className="shrink-0 rounded-full bg-[#4fae4e] px-1.5 py-0.5 text-[10px] font-bold text-white"
                                title="He paid for this item. If she sent the same item more than once before he paid, every copy of it is marked, because the charge names the item and not the message."
                              >
                                🔓 UNLOCKED {m.purchasedStars ?? m.stars ?? 0}★
                              </span>
                            ) : m.paid && m.lockKnown ? (
                              <span
                                className="shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold text-black/60"
                                title="Sent locked and never unlocked. Every media purchase this fan has made names its item, so nothing bought is hiding here."
                              >
                                🔒 LOCKED {m.stars ?? 0}★
                              </span>
                            ) : m.paid ? (
                              <span
                                className="shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold text-black/60"
                                title="The price it was offered at. Whether he unlocked THIS item is not recorded: bundles never name the item on the charge, and no purchase did before 2026-08-18. His unlock total is on the header and in Purchases."
                              >
                                💰 {m.stars ?? 0}★
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-black/[0.07] px-1.5 py-0.5 text-[10px] font-medium text-black/50">
                                FREE
                              </span>
                            )}
                          </div>
                          {m.caption && (
                            <div className="mt-0.5 whitespace-pre-wrap text-[13px] italic opacity-70">{m.caption}</div>
                          )}
                        </>
                      ) : (
                        <span className="whitespace-pre-wrap">{m.content}</span>
                      )}

                      <span className="tg-meta">
                        {m.timeLabel}
                        {!m.fan && <Tick />}
                      </span>
                      {/* Clears the floated meta so a one-line message still
                          reserves height for its own clock. */}
                      <span className="block clear-both" />
                    </div>

                    {/* Inline keyboard, drawn where Telegram draws it: attached
                        under the bubble, not inside it. Rows are preserved as
                        the bot built them. */}
                    {m.buttons && m.buttons.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {m.buttons.map((row, r) => (
                          <div key={r} className="flex gap-1">
                            {row.map((b, c) => (
                              <span key={c} className="tg-kb-btn">
                                {b.text}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Provenance. Only rendered when the row actually carries
                        it. */}
                    {m.flowLabel && (
                      <div className={"flex " + (m.fan ? "justify-start" : "justify-end")}>
                        <span className="tg-prov" title={m.flowHint ?? undefined}>
                          {m.flowEmoji ?? "⚙"} {m.flowLabel}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Live status, at the newest end of the thread where Ronan asked for it. */}
      <div className="flex items-center gap-2 border-t border-line bg-panel px-3 py-1.5 text-[11px] text-muted">
        {typing ? (
          <span className="flex items-center gap-1.5 font-medium text-accent">
            <span className="typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            she is typing
          </span>
        ) : (
          <span>last active {lastActiveLabel}</span>
        )}
        <span className="ml-auto flex items-center gap-2.5 tabular-nums">
          {purchasedCount > 0 && <span>{purchasedCount} bought</span>}
          <span className={spentStars > 0 ? "font-semibold text-good" : ""}>{spentStars.toLocaleString()}★ spent</span>
        </span>
      </div>
    </>
  );
}

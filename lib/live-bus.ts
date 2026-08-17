"use client";

// The client half of the Fans live feed.
//
// Same shape as lib/twin-update-bus.ts and lib/clone-switcher-bus.ts, and for
// the same reason: the receiver (LiveFeed, mounted once) and the consumers (a
// typing dot inside one of 100 server-rendered fan rows, a toast stack in the
// corner, the status strip in the right column) sit in different branches of a
// server-component tree. There is no shared client parent to hold a context,
// and turning /users into a client page to get one would throw away the
// server rendering the whole page is built on.
//
// One EventSource fans out to every subscriber through here. Components
// subscribe to the fan they care about, so a purchase by fan A does not
// re-render fan B's row.

export type LiveEvent =
  | { t: "hello"; cloneId: string | null; at: string }
  | {
      t: "purchase";
      id: string;
      fanId: string;
      fanName: string;
      cloneId: string;
      stars: number;
      item: string | null;
      lifetimeStars: number;
      at: string;
    }
  | {
      t: "drip";
      fanId: string;
      step: number;
      total: number;
      enabled: boolean;
      nextType: string | null;
      nextDueAt: string | null;
    }
  | { t: "typing"; fanId: string; typing: boolean }
  | { t: "error"; message: string };

const EVENT = "fans-live";

export function emitLive(event: LiveEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<LiveEvent>(EVENT, { detail: event }));
}

export function onLive(handler: (event: LiveEvent) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const wrapped = (e: Event) => handler((e as CustomEvent<LiveEvent>).detail);
  window.addEventListener(EVENT, wrapped);
  return () => window.removeEventListener(EVENT, wrapped);
}

// Late subscribers matter here. A drip event fires once, when the value
// changes, and a row that mounts afterwards (the operator hit "Load more", or
// switched the selected fan) would otherwise sit on its stale server-rendered
// value until the next change, which for drip can be hours. So the receiver
// keeps the last state per fan and new subscribers read it on mount.
const dripState = new Map<string, Extract<LiveEvent, { t: "drip" }>>();
const typingState = new Set<string>();

export function rememberLive(event: LiveEvent) {
  if (event.t === "drip") dripState.set(event.fanId, event);
  else if (event.t === "typing") {
    if (event.typing) typingState.add(event.fanId);
    else typingState.delete(event.fanId);
  }
}

export const lastDrip = (fanId: string) => dripState.get(fanId) ?? null;
export const isTyping = (fanId: string) => typingState.has(fanId);

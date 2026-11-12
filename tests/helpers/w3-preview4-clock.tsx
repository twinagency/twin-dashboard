/**
 * W3 ui-onlyfans-preview-4 fake clock for component polls. Replaces the global setInterval (every delay) and setTimeout (delays >= 1 s)
 * with a manual queue that `advance(ms)` runs inside React act(); shorter setTimeouts (the harness's settle(), Base UI) stay real, which is
 * why this is used instead of node:test mock.timers (that would also freeze settle()). Install after the module under test is imported
 * and before mount; always `uninstall()` in a finally.
 */
import { act } from "react";
import { settle } from "./w3-preview4-dom";

type Timer = { id: number; at: number; every: number | null; run: () => void };
const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
let now = 0, seq = 1_000_000, queue: Timer[] = [];

export const pendingTimers = () => queue.map(t => ({ at: t.at - now, every: t.every }));
export function install() {
  now = 0; queue = [];
  globalThis.setTimeout = ((run: (...a: unknown[]) => void, ms = 0, ...args: unknown[]) => {
    if (ms < 1000) return real.setTimeout(run, ms, ...args);
    queue.push({ id: ++seq, at: now + ms, every: null, run: () => run(...args) }); return seq;
  }) as typeof setTimeout;
  globalThis.setInterval = ((run: (...a: unknown[]) => void, ms = 0, ...args: unknown[]) => {
    queue.push({ id: ++seq, at: now + Math.max(1, ms), every: Math.max(1, ms), run: () => run(...args) }); return seq;
  }) as typeof setInterval;
  const clear = (id: unknown) => { if (typeof id === "number" && id > 1_000_000) queue = queue.filter(t => t.id !== id); else real.clearTimeout(id as NodeJS.Timeout); };
  globalThis.clearTimeout = clear as typeof clearTimeout;
  globalThis.clearInterval = clear as typeof clearInterval;
}
export function uninstall() { Object.assign(globalThis, real); queue = []; }
/** Runs every due timer in time order up to now + ms, letting React and the fetch stub settle after each one. */
export async function advance(ms: number) {
  const end = now + ms;
  for (;;) {
    queue.sort((a, b) => a.at - b.at);
    const next = queue[0];
    if (!next || next.at > end) break;
    now = next.at;
    if (next.every) next.at += next.every; else queue.shift();
    await act(async () => { next.run(); });
    await settle(5);
  }
  now = end;
}

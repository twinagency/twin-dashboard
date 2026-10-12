// Bounded retry for transient network / provider errors (429, 5xx, timeouts). Anything else fails at once.
// Shared by the recaption script and the media analysis path; do not copy it again.
export const TRANSIENT_ERROR = /429|5\d\d|fetch failed|network|timeout|ECONN|EAI_AGAIN/i;

export async function withRetry<T>(
  fn: () => Promise<T>,
  tries = 3,
  opts: { baseMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const baseMs = opts.baseMs ?? 1500;
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      const msg = String((e as Error)?.message ?? e);
      if (opts.signal?.aborted || !TRANSIENT_ERROR.test(msg) || i === tries - 1) break;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i + Math.random() * baseMs / 3));
    }
  }
  throw last;
}


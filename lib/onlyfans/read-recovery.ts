/** One bounded recovery for an idempotent read. Writes are never retried here. */
export async function readWithRecovery(url: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch, onRetry?: () => void): Promise<Response> {
  if (init.method && init.method !== "GET") throw Error("Read recovery accepts GET only");
  let first: Response | undefined;
  try { first = await fetchImpl(url, { ...init, method: "GET" }); }
  catch (error) { if (init.signal?.aborted) throw error; }
  if (first && ![502, 503, 504].includes(first.status)) return first;
  // Respect longer server backoff by returning the error and its Retry action.
  if (first?.headers.has("Retry-After")) return first;
  await first?.body?.cancel();
  init.signal?.throwIfAborted();
  onRetry?.();
  await new Promise<void>((resolve, reject) => {
    const signal = init.signal;
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, 250);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
  return fetchImpl(url, { ...init, method: "GET" });
}

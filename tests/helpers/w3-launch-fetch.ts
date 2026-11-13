/**
 * DOM-free offline fetch for the G07a launch rules (W3 lane 2 ui-onlyfans-launch). No network: `stubFetch` replaces globalThis.fetch and answers every
 * request from the test. Synthetic ids only.
 */
export type Call = { url: string; method: string; raw: string | undefined };
/**
 * Installs globalThis.fetch. `answer(url, method, n, raw)` gets every request (n = 0-based count of earlier calls to the same
 * method+path, query ignored) and returns a Response or a promise of one. Calls are recorded with the raw request body so a retry can
 * be compared byte for byte.
 */
export function stubFetch(answer: (url: string, method: string, n: number, raw: string | undefined) => Response | Promise<Response>) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET", raw = init?.body === undefined ? undefined : String(init.body);
    const n = calls.filter(c => c.method === method && c.url.split("?")[0] === url.split("?")[0]).length;
    calls.push({ url, method, raw });
    return answer(url, method, n, raw);
  }) as typeof globalThis.fetch;
  return { calls, posts: (re: RegExp, method = "POST") => calls.filter(c => c.method === method && re.test(c.url)) };
}
export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const html502 = () => new Response("<html><body>502 Bad Gateway</body></html>", { status: 502, headers: { "Content-Type": "text/html" } });

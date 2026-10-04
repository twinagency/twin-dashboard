/**
 * Server-side transport for the two private creator intake buckets.
 *
 * Node's fetch redirect-following path can retain a second copy of a streamed
 * request body (https://github.com/nodejs/undici/issues/4058). A 512 MiB video
 * can therefore exhaust the dashboard container despite disk-backed staging.
 * Storage object writes never need a redirect: reject one instead of buffering
 * a replay or forwarding the authenticated upload to another destination.
 * Authorization, object ownership and validation remain with the callers.
 */
export function creatorStorageFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const intakeObjectWrite = (method === "POST" || method === "PUT")
    && /^\/storage\/v1\/object\/(?:onboarding-content|voice-samples)\//.test(url.pathname);
  return fetch(input, intakeObjectWrite ? { ...init, redirect: "error" } : init);
}

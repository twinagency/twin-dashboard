/**
 * OpenRouter faked at the wire (globalThis.fetch) for W5 lane lib-openrouter-plus6. The real lib/openrouter.ts runs
 * unchanged; only the transport is replaced.
 * - Only https://openrouter.ai is answered; any other host throws (and is recorded in `foreign`): no network, ever.
 * - Replies are served in order from a queue; a request with an empty queue throws (recorded in `unserved`), so a
 *   test can never make an unplanned paid call even by accident.
 * - The key is synthetic and built at runtime; nothing key shaped is a literal here.
 */
export const OR_HOST = "openrouter.ai";

export type OrWire = {
  /** Every request body (parsed JSON) in order. */
  bodies: unknown[];
  /** Authorization header of every request. */
  auth: (string | null)[];
  foreign: string[];
  unserved: number;
  /** Queue one reply (a factory, so each Response is fresh). */
  queue(reply: () => Response | Promise<Response>): void;
  /** Queue N identical replies. */
  queueTimes(n: number, reply: () => Response | Promise<Response>): void;
  calls(): number;
};

export function syntheticKey(): string {
  return "or-test-" + "x".repeat(24);
}

export function installOrWire(): OrWire {
  const replies: (() => Response | Promise<Response>)[] = [];
  const wire: OrWire = {
    bodies: [],
    auth: [],
    foreign: [],
    unserved: 0,
    queue(reply) { replies.push(reply); },
    queueTimes(n, reply) { for (let i = 0; i < n; i++) replies.push(reply); },
    calls() { return wire.bodies.length; },
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    if (url.host !== OR_HOST) {
      wire.foreign.push(href);
      throw new Error(`openrouter fake: refused non-fake host ${url.host}`);
    }
    wire.auth.push(new Headers(init?.headers).get("authorization"));
    wire.bodies.push(typeof init?.body === "string" ? JSON.parse(init.body) : null);
    const next = replies.shift();
    if (!next) {
      wire.unserved++;
      throw new Error("openrouter fake: no reply queued for this request");
    }
    return next();
  }) as typeof fetch;
  return wire;
}

export function jsonReply(body: unknown, status = 200): () => Response {
  return () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function textReply(text: string, status: number): () => Response {
  return () => new Response(text, { status, headers: { "content-type": "text/plain" } });
}

/** One non-stream chat completion. */
export function completion(content: string | null, finishReason: string, extra: { refusal?: string; cost?: number } = {}): () => Response {
  return jsonReply({
    id: "gen-fake",
    model: "fake/model",
    provider: "FakeProvider",
    choices: [{ index: 0, finish_reason: finishReason, message: { role: "assistant", content, ...(extra.refusal ? { refusal: extra.refusal } : {}) } }],
    ...(extra.cost !== undefined ? { usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: extra.cost } } : {}),
  });
}

/** A streamed (SSE) chat completion made of the given chunk objects, then [DONE]. */
export function sseReply(chunks: unknown[]): () => Response {
  return () => {
    const text = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
    return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
}

export function sseChunk(delta: Record<string, unknown>, finishReason: string | null = null): unknown {
  return { id: "gen-fake", model: "fake/model", choices: [{ index: 0, delta, finish_reason: finishReason }] };
}

/** A plain text streamed answer that ends the tool loop. */
export function sseText(text: string): () => Response {
  return sseReply([sseChunk({ role: "assistant", content: text }), sseChunk({}, "stop")]);
}

export async function drain<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

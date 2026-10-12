// Minimal OpenRouter chat helper (server-only).
const URL = "https://openrouter.ai/api/v1/chat/completions";

export type VisionCallMeta = {
  model: string;            // the model OpenRouter reports it served
  provider: string | null;  // the upstream provider that served it
  latencyMs: number;
  costUsd: number | null;   // OpenRouter's own usage.cost when reported
  finishReason: string | null;
};
export type VisionOptions = {
  model: string;
  dataUrl?: string;
  prompt: string;
  json?: boolean;
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;     // defaults to 0: cataloguing must be repeatable
  provider?: { only: string[]; allow_fallbacks: false };
  reasoning?: { effort: "xhigh"; exclude: true };
  textFirst?: boolean;      // preserve the evaluated multimodal message order when requested
};

export async function orVisionDetailed(opts: VisionOptions): Promise<{ content: string; meta: VisionCallMeta }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY missing");
  if (!opts.dataUrl) throw new Error("orVision: no image");
  const started = Date.now();
  const imagePart = { type: "image_url", image_url: { url: opts.dataUrl } };
  const textPart = { type: "text", text: opts.prompt };

  const res = await fetch(URL, {
    method: "POST",
    signal: opts.signal,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: [{
        role: "user",
        content: opts.textFirst ? [textPart, imagePart] : [imagePart, textPart],
      }],
      // Some OpenRouter providers default to a low completion cap when this is
      // omitted, which silently truncates a longer JSON response mid-string.
      // Always set it explicitly rather than trusting the provider default.
      max_tokens: opts.maxTokens ?? 1000,
      temperature: opts.temperature ?? 0,
      usage: { include: true },
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      ...(opts.provider ? { provider: opts.provider } : {}),
      ...(opts.reasoning ? { reasoning: opts.reasoning } : {}),
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const finishReason = j.choices?.[0]?.finish_reason;
  if (j.error || j.choices?.[0]?.message?.refusal || (finishReason && finishReason !== "stop")) {
    throw new Error(`OpenRouter: vision response incomplete or refused (${finishReason ?? "error"})`);
  }
  const content = j.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("OpenRouter: no content");
  return {
    content,
    meta: {
      model: typeof j.model === "string" ? j.model : opts.model,
      provider: typeof j.provider === "string" ? j.provider : null,
      latencyMs: Date.now() - started,
      costUsd: typeof j.usage?.cost === "number" ? j.usage.cost : null,
      finishReason: typeof j.choices?.[0]?.finish_reason === "string" ? j.choices[0].finish_reason : null,
    },
  };
}

export async function orVision(opts: VisionOptions): Promise<string> {
  return (await orVisionDetailed(opts)).content;
}

// Multi-turn chat — like orChat but carries a short conversation history. Used by
// the in-dash simulator to preview how a clone would reply.
export async function orChatTurns(opts: {
  model: string;
  system?: string;
  turns: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
}): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY missing");

  const messages = [
    ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
    ...opts.turns,
  ];

  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: opts.model, messages, temperature: opts.temperature ?? 0.8 }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenRouter: no content");
  return content;
}

// ── Tool-calling chat ─────────────────────────────────────────────────────────
// Used by the internal AI assistant (app/api/ai-assistant) to let a model call
// read-only tools (e.g. query the DB via an allowlisted dispatcher). This file
// stays transport-only: it knows the OpenAI-compatible tool-calling wire format
// and drives the request/response loop, but has no idea what any tool DOES —
// that's supplied by the caller as `executeTool` (see app/api/ai-assistant/tools.ts).
export type OrToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

type OrToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

type OrMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OrToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export async function orChatWithTools(opts: {
  model: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  tools: OrToolDef[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxIterations?: number;
  temperature?: number;
}): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY missing");

  const history: OrMessage[] = [
    ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
    ...opts.messages,
  ];

  const maxIterations = opts.maxIterations ?? 6;
  for (let i = 0; i < maxIterations; i++) {
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: history,
        tools: opts.tools,
        temperature: opts.temperature ?? 0.3,
      }),
    });

    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    const j = await res.json();
    const msg = j.choices?.[0]?.message;
    if (!msg) throw new Error("OpenRouter: no message");

    const toolCalls = msg.tool_calls as OrToolCall[] | undefined;
    if (!toolCalls || toolCalls.length === 0) {
      if (typeof msg.content !== "string") throw new Error("OpenRouter: no content");
      return msg.content;
    }

    history.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls });

    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // malformed args → let the tool see an empty object rather than throwing
      }
      let result: unknown;
      try {
        result = await opts.executeTool(call.function.name, args);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "tool failed" };
      }
      history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  throw new Error("OpenRouter: tool-call loop exceeded max iterations");
}

// ── Streaming tool-calling chat ───────────────────────────────────────────────
// Same wire format and tool-call loop as orChatWithTools above, but streams
// text tokens back as they arrive instead of blocking for the whole answer,
// and surfaces tool-call activity as it happens (so a UI can show "checking
// top spenders..." instead of a static "thinking" spinner). Used by the /ai
// assistant's streaming route (app/api/ai-assistant/route.ts).
export type OrStreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_call"; name: string }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "done" }
  | { type: "error"; message: string };

type StreamToolCallAcc = { id: string; name: string; arguments: string };

export async function* orChatWithToolsStream(opts: {
  model: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  tools: OrToolDef[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxIterations?: number;
  temperature?: number;
}): AsyncGenerator<OrStreamEvent, void, unknown> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    yield { type: "error", message: "OPENROUTER_API_KEY missing" };
    return;
  }

  const history: OrMessage[] = [
    ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
    ...opts.messages,
  ];

  const maxIterations = opts.maxIterations ?? 6;
  for (let i = 0; i < maxIterations; i++) {
    let res: Response;
    try {
      res = await fetch(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          messages: history,
          tools: opts.tools,
          temperature: opts.temperature ?? 0.3,
          stream: true,
        }),
      });
    } catch (e) {
      yield { type: "error", message: e instanceof Error ? e.message : "network error" };
      return;
    }

    if (!res.ok || !res.body) {
      yield { type: "error", message: `OpenRouter ${res.status}: ${await res.text().catch(() => "")}` };
      return;
    }

    let content = "";
    const toolCallAcc = new Map<number, StreamToolCallAcc>();
    let finishReason: string | null = null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";
      for (const evt of events) {
        const line = evt.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        let parsed: any;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = parsed?.choices?.[0]?.delta;
        const fr = parsed?.choices?.[0]?.finish_reason;
        if (fr) finishReason = fr;
        if (typeof delta?.content === "string" && delta.content) {
          content += delta.content;
          yield { type: "token", text: delta.content };
        }
        if (Array.isArray(delta?.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const cur = toolCallAcc.get(idx) ?? { id: "", name: "", arguments: "" };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name = tc.function.name;
            if (typeof tc.function?.arguments === "string") cur.arguments += tc.function.arguments;
            toolCallAcc.set(idx, cur);
          }
        }
      }
    }

    if (toolCallAcc.size === 0) {
      yield { type: "done" };
      return;
    }

    const toolCalls: OrToolCall[] = [...toolCallAcc.values()]
      .filter((t) => t.id && t.name)
      .map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: t.arguments } }));

    history.push({ role: "assistant", content: content || null, tool_calls: toolCalls });

    for (const call of toolCalls) {
      yield { type: "tool_call", name: call.function.name };
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // malformed args → let the tool see an empty object rather than throwing
      }
      let result: unknown;
      try {
        result = await opts.executeTool(call.function.name, args);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "tool failed" };
      }
      yield { type: "tool_result", name: call.function.name, result };
      history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
    void finishReason; // only used implicitly via tool_calls presence above
  }

  yield { type: "error", message: "OpenRouter: tool-call loop exceeded max iterations" };
}

export async function orChat(opts: {
  model: string;
  system?: string;
  user: string;
  temperature?: number;
  json?: boolean;
}): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY missing");

  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: opts.user },
  ];

  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages,
      temperature: opts.temperature ?? 0.7,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenRouter: no content");
  return content;
}


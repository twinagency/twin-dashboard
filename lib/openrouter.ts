// Minimal OpenRouter chat helper (server-only).
const URL = "https://openrouter.ai/api/v1/chat/completions";

export async function orVision(opts: {
  model: string;
  dataUrl: string;
  prompt: string;
  json?: boolean;
}): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY missing");

  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: opts.dataUrl } },
          { type: "text", text: opts.prompt },
        ],
      }],
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenRouter: no content");
  return content;
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

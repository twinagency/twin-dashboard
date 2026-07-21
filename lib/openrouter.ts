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

// Dashboard MIRROR of ../bot/src/services/llm.ts's OPENROUTER_EXTRA_PARAMS.
// KEEP IN SYNC with that constant. There is no shared import between the two
// repos at build time (separate images, separate deploys), so this is a
// literal copy rather than a re-export, the same pattern lib/persona-facts.ts
// already uses for ../bot/src/prompt.ts.
//
// This is the JSON spread into every OpenRouter chat/completions call, on
// every model, every clone (this project has no per-clone code paths). The
// dashboard shows it so "what fields do we actually send" is one page, not
// an archaeology dig through llm.ts three call sites.
export const OPENROUTER_EXTRA_PARAMS = { reasoning: { enabled: false }, thinking: { type: "disabled" } } as const;

export const OPENROUTER_FIELD_NOTES: { field: string; value: string; why: string }[] = [
  {
    field: "reasoning.enabled",
    value: "false",
    why: "OpenRouter's own cross-provider reasoning toggle. Stops a hidden chain-of-thought from being generated and billed before the reply (grok-4.3 averaged 713 completion tokens/call against grok-4.20's 24 for the same reply).",
  },
  {
    field: "thinking.type",
    value: '"disabled"',
    why: "DeepSeek's OWN thinking-mode field, separate from OpenRouter's reasoning toggle above. OpenRouter's reasoning:{enabled:false} does not reliably turn off DeepSeek's native thinking mode (default: enabled, effort high). Added 2026-08-30 after DeepSeek's internal scratchpad text reached a real fan 3 times on the 2026-08-23 deepseek-v4-pro cutover.",
  },
];

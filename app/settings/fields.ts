// The editable global API keys. Runtime (src/services/secrets.ts) reads these and
// falls back to .env when unset.
export const API_KEY_FIELDS = [
  { key: "openrouter_api_key", label: "OpenRouter API key" },
  { key: "elevenlabs_api_key", label: "ElevenLabs API key" },
  { key: "deepgram_api_key", label: "Deepgram API key" },
] as const;

// app_settings key holding the JSON template new clones inherit.
export const CLONE_DEFAULTS_KEY = "clone_defaults";

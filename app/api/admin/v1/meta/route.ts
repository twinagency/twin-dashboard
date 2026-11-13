import { withAdmin, ok, API_VERSION } from "@/lib/api-route";
import {
  adminTables,
  adminColumns,
  FORBIDDEN_COLUMNS,
  MAX_LIMIT,
  DEFAULT_LIMIT,
} from "@/lib/api-read";

export const dynamic = "force-dynamic";

// Self-description. Exists so a tool (or an AI assistant) can discover the
// surface without a human transcribing the allowlist into a prompt, and so the
// exclusions are stated OUT LOUD rather than being invisible absences — a
// caller that can see `excluded` knows bot_token is withheld on purpose and
// stops looking for the endpoint that returns it.
export const GET = withAdmin(async () => {
  const tables: Record<string, string[]> = {};
  for (const t of adminTables()) tables[t] = adminColumns(t) ?? [];

  return ok({
    api: "twin-admin",
    version: API_VERSION,
    readOnly: true,
    limits: { defaultLimit: DEFAULT_LIMIT, maxLimit: MAX_LIMIT },
    tables,
    excluded: FORBIDDEN_COLUMNS,
    excludedReason:
      "clones.bot_token is a live Telegram credential; app_settings.value holds the raw OpenRouter/ElevenLabs/Deepgram keys. Neither is reachable through any endpoint.",
    endpoints: [
      "GET /api/admin/v1/meta",
      "GET /api/admin/v1/query?table=&select=&filter=col:op:value&order=&asc=&limit=",
      "GET /api/admin/v1/clones",
      "GET /api/admin/v1/config?clone=<uuid|slug|name>",
      "GET /api/admin/v1/prompts",
      "GET /api/admin/v1/chats?clone=&fan=&limit=&before=&cursor=",
      "GET /api/admin/v1/fans?clone=&fan=&limit=",
      "GET /api/admin/v1/logs?clone=&level=&source=&since=&limit=",
      "GET /api/admin/v1/revenue?period=&clone=",
    ],
  });
});

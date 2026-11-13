import { withAdmin, ok, API_VERSION } from "@/lib/api-route";
import {
  adminTables,
  adminColumns,
  FORBIDDEN_COLUMNS,
  MAX_LIMIT,
  DEFAULT_LIMIT,
} from "@/lib/api-read";

export const dynamic = "force-dynamic";

// Every (verb, route) under app/api/admin/v1. check-admin-api.ts B10 fails when a
// route file or verb is missing here, so a new endpoint cannot ship undiscoverable.
const ENDPOINTS = [
  "GET /api/admin/v1/meta",
  "GET /api/admin/v1/query?table=&select=&filter=col:op:value&order=&asc=&limit=",
  "GET /api/admin/v1/clones",
  "GET /api/admin/v1/config?clone=<uuid|slug|name>",
  "GET /api/admin/v1/prompts",
  "GET /api/admin/v1/chats?clone=&fan=&limit=&before=&cursor=",
  "GET /api/admin/v1/fans?clone=&fan=&limit=",
  "GET /api/admin/v1/logs?clone=&level=&source=&since=&limit=",
  "GET /api/admin/v1/revenue?period=&start=&end=&clone=",
  "GET /api/admin/v1/act-as/revenue?period=&start=&end= (header x-twin-act-as: clone:<uuid>|agency:<uuid>)",
  "GET /api/admin/v1/sim/revenue?seed=&period=&start=&end=",
  "GET /api/admin/v1/sim/fans?seed=&limit=",
  "GET /api/admin/v1/mtproto/connections",
  "GET /api/admin/v1/mtproto/runs?id=&limit=",
  "GET /api/admin/v1/mtproto/events?clone=&run=&eventType=&since=&limit=",
  "GET /api/admin/v1/mtproto/preview?clone=&segment=&language=&minSpendStars=&lastActiveFromDays=&lastActiveToDays=&runCap=&dailyCap=&holdoutPct=&includeLegacy=",
  "GET /api/admin/v1/posting/targets?fresh=",
  "GET /api/admin/v1/posting/media?clone=&type=&q=&offset=&limit=",
  "GET /api/admin/v1/posting/recent?clone=&days=&limit=",
  "GET /api/admin/v1/onlyfans/upload-permission?creatorId=&actor=",
  "POST /api/admin/v1/clones/create",
  "POST /api/admin/v1/clones/write",
  "POST /api/admin/v1/media",
  "POST /api/admin/v1/mtproto/write",
  "POST /api/admin/v1/posting/write",
];

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
    // Not read-only: the POST routes below write (G16, W4 F8). Each delegates to a
    // validated server action or a Telegram call and is audited in system_logs.
    readOnly: false,
    writeRoutes: ENDPOINTS.filter((e) => e.startsWith("POST ")),
    limits: { defaultLimit: DEFAULT_LIMIT, maxLimit: MAX_LIMIT },
    tables,
    excluded: FORBIDDEN_COLUMNS,
    excludedReason:
      "clones.bot_token is a live Telegram credential; app_settings.value holds the raw OpenRouter/ElevenLabs/Deepgram keys. Neither is reachable through any endpoint.",
    endpoints: ENDPOINTS,
  });
});

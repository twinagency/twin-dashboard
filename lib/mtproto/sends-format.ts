// lib/mtproto/sends-format.ts
//
// Split out from sends.ts (2026-09-23), same reason halt.ts was split from
// halt-server.ts: a "use client" component (ActivityFeed.tsx, via
// RecentSends.tsx) needs sendFanLabel without dragging sends.ts's own
// attribution.ts -> db.ts -> lib/supabase.ts -> next/headers import chain
// into the client bundle. Pure only, no db import.

import type { SendRow } from "./types";

/** What the sends list calls a fan: the telegram id, or "deleted fan" when the
 *  users row is gone (migration 163 sets user_id NULL; the send still shows). */
export function sendFanLabel(r: Pick<SendRow, "userId" | "telegramId">): string {
  return r.userId == null ? `deleted fan (${r.telegramId})` : String(r.telegramId);
}

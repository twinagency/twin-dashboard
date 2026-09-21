// lib/mtproto/db.ts
//
// The one place this area gets its Supabase client. Every module in
// lib/mtproto/ calls mtDb() instead of importing supabaseAdmin directly so the
// test harness (lib/mtproto/tests/fake-db.ts) can swap in an in-memory fake and
// exercise the real write paths (createDryRun, confirmLive, stopRun, global
// stop) without ever touching a real Supabase project.

import { supabaseAdmin } from "@/lib/supabase";

let override: typeof supabaseAdmin | null = null;

export function mtDb(): typeof supabaseAdmin {
  return override ?? supabaseAdmin;
}

/** Test-only seam. Pass null to restore the real client. */
export function __setMtDbForTest(fake: unknown): void {
  override = (fake as typeof supabaseAdmin | null) ?? null;
}

// lib/mtproto/clones.ts
//
// The one place this area reads the `clones` table. Deliberately minimal
// (id/name/slug/status/business_username only) — persona, pricing and every
// other clone column belong to the existing dashboard's own modules, not
// here. `clones` is small (a fleet is tens of rows), so this is a plain
// unpaged select, matching the convention lib/select-all.ts's own comments
// describe ("`clones` is absent [from the unbounded list] on purpose").

import { mtDb } from "./db";
import type { CreatorLite } from "./types";

type CloneRow = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
  business_username: string | null;
  account_phone: string | null;
};

export async function listCreators(): Promise<CreatorLite[]> {
  const { data, error } = await mtDb()
    .from("clones")
    .select("id,name,slug,status,business_username,account_phone")
    .order("name", { ascending: true });
  if (error) {
    console.error(`[mtproto] listCreators failed: ${error.message}`);
    return [];
  }
  return ((data ?? []) as CloneRow[]).map((r) => ({
    id: r.id,
    name: r.name ?? "(unnamed)",
    slug: r.slug ?? r.id,
    status: r.status === "paused" ? "paused" : "active",
    businessUsername: r.business_username,
    accountPhone: r.account_phone ?? null,
  }));
}

export async function getCreator(cloneId: string): Promise<CreatorLite | null> {
  const { data, error } = await mtDb()
    .from("clones")
    .select("id,name,slug,status,business_username,account_phone")
    .eq("id", cloneId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as CloneRow;
  return {
    id: r.id,
    name: r.name ?? "(unnamed)",
    slug: r.slug ?? r.id,
    status: r.status === "paused" ? "paused" : "active",
    businessUsername: r.business_username,
    accountPhone: r.account_phone ?? null,
  };
}

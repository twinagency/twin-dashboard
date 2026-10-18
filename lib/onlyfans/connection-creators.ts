import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireOnlyFansRead } from "./route";
export type ConnectionCreator = { id: string; name: string };
const valid = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(value);

/** Existing identity owner only. No provider account or second creator is minted here. */
export async function listConnectionCreators(): Promise<ConnectionCreator[]> {
  const context = await requireOnlyFansRead();
  if (context instanceof NextResponse) return [];
  try {
    const { data, error } = await supabaseAdmin.from("clones").select("id,name").order("name", { ascending: true }).limit(500);
    if (error || !data) return [];
    return data.filter(row => valid(row.id) && typeof row.name === "string" && row.name.trim().length > 0)
      .map(row => ({ id: row.id as string, name: row.name as string }));
  } catch { return []; }
}

export async function resolveConnectionCreator(id: unknown): Promise<ConnectionCreator | null> {
  const context = await requireOnlyFansRead();
  if (context instanceof NextResponse || !valid(id)) return null;
  try {
    const { data, error } = await supabaseAdmin.from("clones").select("id,name").eq("id", id).maybeSingle();
    return !error && data && data.id === id && typeof data.name === "string" && data.name.trim()
      ? { id: data.id, name: data.name } : null;
  } catch { return null; }
}

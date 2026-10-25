import "server-only";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { serviceClient as localServiceClient, serviceClientForAccess } from "@/lib/supabase-service";
import { isAuthed } from "@/lib/auth";
import { isFlirtOnlyFansOwner } from "./flirt-owner";
async function connectionDatabase() {
  const access = await getDashboardAccess();
  // The shared OnlyFans owner has already passed connectionAccess. The general
  // agency client intentionally refuses new profiles and cannot serve this path.
  return isFlirtOnlyFansOwner(access, await isAuthed())
    ? serviceClientForAccess(access)
    : localServiceClient();
}
import { getDashboardAccess } from "@/lib/dashboard-access";
import { requireOnlyFansRead } from "./route";
import { trustedFormOrigin } from "@/lib/form-origin";
import { readCommandJson } from "./command-json";
import { canonicalConnection } from "@/lib/onlyfans-connections/contract";
import { connectionRefusal } from "@/lib/onlyfans-connections/route";
export type ConnectionCreator = { id: string; name: string; expectedHandle?: string };
const valid = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(v);
const hash = (v: string) => createHash("sha256").update(v).digest("hex");

/** Recheck the verified membership and creator scope on every request, including frames. */
export async function connectionAccess(write = false) {
  const ctx = await requireOnlyFansRead({ agency: true, write });
  if (ctx instanceof NextResponse) return ctx;
  if (!ctx.actor || !ctx.canManage) return connectionRefusal(403, "Manager access is required to connect accounts.");
  const identity = await getDashboardAccess();
  const agency = isFlirtOnlyFansOwner(identity, await isAuthed()) ? null : identity;
  if (agency && !ctx.auth.agencyGrant) return connectionRefusal(403, "Scoped agency access is required.");
  // Backend connection credentials stay server-side. Bind the delegated operator
  // identity to the verified agency user; never accept an actor from the browser.
  const actor = agency ? "op-session:" + hash("onlyfans-agency-connection.v1:" + ctx.actor) : ctx.actor;
  return { actor, agency, creatorIds: ctx.auth.agencyGrant?.creatorIds ?? null };
}

export async function connectionSignInCommand(request: NextRequest) {
  const ctx = await connectionAccess(true);
  if (ctx instanceof NextResponse) return ctx;
  if (!trustedFormOrigin(request) || ![null, "same-origin"].includes(request.headers.get("sec-fetch-site")) ||
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return connectionRefusal(403, "Connect accounts from this dashboard.");
  let body: unknown;
  try { body = await readCommandJson(request, 131072); }
  catch (e) { return connectionRefusal(e instanceof Error && e.message === "Command is too large" ? 413 : 400, "The connection request is invalid."); }
  return { ...ctx, body, identity: (scope: string, command: unknown) =>
    ({ actor: ctx.actor, commandKey: hash(canonicalConnection([ctx.actor, scope, command])) }) };
}

function publicCreator(row: { id: string; name: string; intake?: any }): ConnectionCreator {
  const handle = row.intake?.onlyfans_connection?.handle;
  return { id: row.id, name: row.name, ...(typeof handle === "string" && /^[a-z0-9_.-]{1,80}$/i.test(handle) ? { expectedHandle: handle } : {}) };
}

export async function listConnectionCreators(): Promise<ConnectionCreator[]> {
  const ctx = await connectionAccess();
  if (ctx instanceof NextResponse || ctx.creatorIds?.length === 0) return [];
  try {
    let query = (await connectionDatabase()).from("clones").select("id,name,intake").order("name", { ascending: true }).limit(500);
    if (ctx.creatorIds) query = query.in("id", ctx.creatorIds);
    const { data, error } = await query;
    return error || !data ? [] : data.filter(row => valid(row.id) && typeof row.name === "string" && row.name.trim()).map(publicCreator);
  } catch { return []; }
}

export async function resolveConnectionCreator(id: unknown): Promise<ConnectionCreator | null> {
  const ctx = await connectionAccess();
  if (ctx instanceof NextResponse || !valid(id) || (ctx.creatorIds && !ctx.creatorIds.includes(id))) return null;
  try {
    const { data, error } = await (await connectionDatabase()).from("clones").select("id,name,intake").eq("id", id).maybeSingle();
    return !error && data && data.id === id && typeof data.name === "string" && data.name.trim() ? publicCreator(data) : null;
  } catch { return null; }
}

/** Same paused, channel-neutral profile fields as setup_creator_platforms.
 * No Telegram token, auth user, outgoing permission, or provider account is minted.
 * A stable agency+handle ID makes retries converge, including a lost response.
 */
export async function createConnectionCreator(ctx: Exclude<Awaited<ReturnType<typeof connectionAccess>>, NextResponse>, body: unknown) {
  if (ctx.agency && "creatorScope" in ctx.agency && ctx.agency.creatorScope === "selected") return connectionRefusal(403, "An agency manager with access to all creators must add a new creator.");
  const b = body as { name?: unknown; handle?: unknown };
  if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).sort().join(",") !== "handle,name" ||
      typeof b.name !== "string" || typeof b.handle !== "string")
    return connectionRefusal(400, "Enter the creator's full name and OnlyFans handle.");
  const name = b.name.trim(), handle = b.handle.trim().replace(/^@/, "").toLowerCase();
  if (!name || Buffer.byteLength(name) > 160 || /[\x00-\x1f\x7f]/.test(name) || !/^[a-z0-9_.-]{1,80}$/.test(handle))
    return connectionRefusal(400, "Enter a full name (up to 160 bytes) and an OnlyFans handle without a URL.");
  const owner = ctx.agency ? "agency:" + ctx.agency.id : "operator";
  const digest = hash("onlyfans-profile.v1:" + owner + ":" + handle);
  const id = digest.slice(0,8)+"-"+digest.slice(8,12)+"-5"+digest.slice(13,16)+"-a"+digest.slice(17,20)+"-"+digest.slice(20,32);
  const slug = "of-profile-" + id;
  const db = await connectionDatabase();
  try {
    const previous = await db.from("clones").select("id,name,slug,intake").eq("id", id).maybeSingle();
    if (previous.error) return connectionRefusal(503, "Creator setup is unavailable. Try again.");
    let row = previous.data;
    if (!row) {
      const inserted = await db.from("clones").insert({ id, slug, name, bot_token: "", status: "paused", engine: "live",
        voice_enabled: false, charge_messages: false, drip_enabled: false, uses_default_config: false,
        intake: { onlyfans_connection: { owner, handle } } }).select("id,name,slug,intake").single();
      if (inserted.error && inserted.error.code !== "23505") return connectionRefusal(503, "The creator could not be saved. Try again.");
      row = inserted.data ?? (await db.from("clones").select("id,name,slug,intake").eq("id", id).maybeSingle()).data;
    }
    if (!row || row.slug !== slug || row.intake?.onlyfans_connection?.owner !== owner || row.intake?.onlyfans_connection?.handle !== handle)
      return connectionRefusal(409, "This creator could not be matched. Select an existing creator or contact your administrator.");
    if (ctx.agency) {
      // Only the profile derived above can be assigned. A partial failure leaves
      // it paused and inaccessible; retry repairs the assignment without a duplicate.
      const assigned = await db.from("agency_creators").upsert({ agency_id: ctx.agency.id, clone_id: id }, { onConflict: "agency_id,clone_id", ignoreDuplicates: true });
      if (assigned.error) return connectionRefusal(503, "The creator is saved, but agency access could not be confirmed. Retry with the same handle.");
    }
    return publicCreator(row);
  } catch { return connectionRefusal(503, "Creator setup could not be confirmed. Retry with the same handle."); }
}

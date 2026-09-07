import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "./supabase";
import { AGENCY_COOKIE, scopeAgencyClones } from "./agency-policy";
import { selectAllRowsParallel } from "./select-all";
import { rollupRevenueLedger, type RevenueLedgerRow } from "./revenue-ledger";

export async function agencyIdentity(token: string | undefined) {
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  const member = await supabaseAdmin.from("agency_memberships")
    .select("agency_id").eq("user_id", data.user.id).eq("active", true).maybeSingle();
  if (member.error || !member.data) return null;
  const agency = await supabaseAdmin.from("partner_agencies")
    .select("id,name").eq("id", member.data.agency_id).eq("active", true).maybeSingle();
  if (agency.error || !agency.data) return null;
  const assigned = await supabaseAdmin.from("agency_creators")
    .select("clone_id").eq("agency_id", agency.data.id);
  if (assigned.error) return null;
  return { id: agency.data.id as string, name: agency.data.name as string,
    cloneIds: (assigned.data ?? []).map(row => row.clone_id as string) };
}

export async function agencyData(requested?: string, days = 7, fan?: string) {
  const identity = await agencyIdentity((await cookies()).get(AGENCY_COOKIE)?.value);
  if (!identity) redirect("/agency/login");
  const ids = scopeAgencyClones(identity.cloneIds, requested);
  if (!ids.length) return { identity, creators: [], revenue: null, fans: [], messages: [], media: [], events: [], start: "", end: "" };
  const end = new Date().toISOString();
  const start = new Date(Date.now() - days * 86400000).toISOString();
  const [creators, ledger, fans, photos, videos, events] = await Promise.all([
    supabaseAdmin.from("clones").select("id,name,status,photos_enabled,videos_enabled,voice_enabled,intent_classic_promotions_enabled,intent_classic_promotion_version")
      .in("id", ids).order("name"),
    selectAllRowsParallel<RevenueLedgerRow>(() => supabaseAdmin.from("star_transactions")
      .select("id,clone_id,telegram_id,amount_stars,invoice_payload")
      .in("clone_id", ids).gte("paid_at", start).lte("paid_at", end).order("id"), { label: "agency revenue" }),
    requested ? supabaseAdmin.from("users").select("id,telegram_id,name")
      .eq("clone_id", requested).order("id").limit(100) : Promise.resolve({ data: [], error: null }),
    requested ? supabaseAdmin.from("photos").select("id,caption,star_value").eq("clone_id", requested).order("id").limit(100) : Promise.resolve({data:[],error:null}),
    requested ? supabaseAdmin.from("videos").select("id,caption,star_value").eq("clone_id", requested).order("id").limit(100) : Promise.resolve({data:[],error:null}),
    selectAllRowsParallel<{id:string;attempt_id:string;clone_id:string;event_type:"attempted"|"blocked"|"delivered"|"purchased";variant:"v2"|"v3"|"control";price_stars:number|null;block_reason:string|null;created_at:string}>(() => supabaseAdmin.from("intent_offer_events")
      .select("id,attempt_id,clone_id,event_type,variant,price_stars,block_reason,created_at")
      .in("clone_id",ids).gte("created_at",start).lte("created_at",end).order("id"), {label:"agency offer events"}),
  ]);
  if (creators.error || ledger.truncated || fans.error || photos.error || videos.error || events.truncated) throw new Error("Agency data is temporarily unavailable");
  let messages: { role: string; content: string; created_at: string }[] = [];
  if (fan && requested) {
    const owner = await supabaseAdmin.from("users").select("telegram_id")
      .eq("id", fan).eq("clone_id", requested).maybeSingle();
    if (owner.error || !owner.data) throw new Error("Fan access denied");
    const chat = await supabaseAdmin.from("chat_history").select("role,content,created_at")
      .eq("clone_id", requested).eq("telegram_id", owner.data.telegram_id)
      .in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(50);
    if (chat.error) throw new Error("Conversation temporarily unavailable");
    messages = (chat.data ?? []).reverse();
  }
  return { identity, creators: creators.data ?? [], revenue: rollupRevenueLedger(ledger.rows),
    fans: fans.data ?? [], messages, media: [...(photos.data ?? []).map(p=>({...p,kind:"photo"})),...(videos.data ?? []).map(v=>({...v,kind:"video"}))], events: events.rows, start, end };
}

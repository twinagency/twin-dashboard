/**
 * One-off: apply Kyla's new dollar pricing card as a Star guide, then reprice
 * her live photos against it (guarded, mirrors app/media/actions.ts).
 * Rate: fan-facing, 50 Stars per $1 (Telegram sells 100 Stars ~ $1.99).
 */
import { supabaseAdmin } from "@/lib/supabase";
import { buildSafeRepricePlan, type RepriceableMediaRow, type CategoryPricing } from "@/lib/pricing";

const DRY = process.argv.includes("--dry-run");
const KYLA = "d2678dce-6a4e-4f1c-b54a-86057bba427c";

// card $ -> Stars at 50/$1. Keys with no card row keep their current value.
const GUIDE: CategoryPricing = {
  sfw: 400, mirror_selfie: 450, outdoor: 510, pool: 560, bed: 610, // no card row
  bikini: 1500,      // Boobs/Booty covered $30
  feet: 1500,        // Feet $30
  ass: 3000,         // Booty bare $60
  tits: 3000,        // Boobs bare $60
  topless: 3000,     // Boobs bare $60
  solo: 3750,        // Kitty / implied solo $75
  lingerie: 4000,    // Nude but covered $80
  shower: 4500,      // Shower content $90
  full_nude: 10000,  // Full nip $200
  pussy: 25000,      // Explicit kitty / toys $500
  anal: 25000,       // same explicit tier
};

async function main() {
  const { data, error } = await supabaseAdmin
    .from("photos").select("id,tags,nsfw,star_value,is_free").eq("clone_id", KYLA);
  if (error) throw new Error(error.message);
  const plan = buildSafeRepricePlan((data ?? []) as RepriceableMediaRow[], GUIDE);
  console.log(`photos total=${plan.total} changes=${plan.changes.length} unchanged=${plan.unchanged} free=${plan.protectedFree} noDecrease=${plan.protectedFromDecrease} +${plan.increaseStars}⭐`);
  if (DRY) {
    for (const c of plan.changes.slice(0, 8)) console.log(`  [dry] ${c.id} ${c.currentPrice} -> ${c.nextPrice}`);
    console.log("[dry] guide NOT saved");
    return;
  }
  const { error: gErr } = await supabaseAdmin.from("clones").update({ category_pricing: GUIDE }).eq("id", KYLA);
  if (gErr) throw new Error(gErr.message);
  console.log("guide saved");
  let applied = 0, skipped = 0, failed = 0;
  for (const c of plan.changes) {
    const { data: upd, error: uErr } = await supabaseAdmin
      .from("photos").update({ star_value: c.nextPrice, is_free: false })
      .eq("id", c.id).eq("clone_id", KYLA)
      .eq("star_value", c.currentPrice).eq("is_free", false).select("id");
    if (uErr) { failed++; continue; }
    if (upd?.length !== 1) { skipped++; continue; }
    applied++;
  }
  console.log(`applied=${applied} skipped=${skipped} failed=${failed}`);
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });

import { supabaseAdmin } from "@/lib/supabase";
import SimClient from "./SimClient";

// The SMALL sim: an AI fan texts an AI-played creator, in-process, no
// external service, no bot source bundled into this deploy. Good for
// texting/flow/routing checks; NOT a stand-in for the real fleet's fan sims
// (bot/src/dev/ai-fan.ts, twinsim) which run the actual bot handler and are
// the ones that prove real production behaviour.
export const dynamic = "force-dynamic";

export default async function SimPage() {
  const { data } = await supabaseAdmin.from("clones").select("id,name,slug").eq("status", "active").order("name");
  const clones = (data ?? []) as { id: string; name: string; slug: string }[];

  return (
    <div className="dashboard-page text-ink">
      <div className="mb-3">
        <h1 className="text-lg font-semibold">Sim</h1>
        <p className="text-sm text-muted">
          An AI fan texts one of your girls. Quick check on flow, tone and routing — not a stand-in for the full
          fleet sim (real payments/media rules run in the bot itself).
        </p>
      </div>
      <SimClient clones={clones} />
    </div>
  );
}

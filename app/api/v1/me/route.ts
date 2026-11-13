import { withModelKey, publicOk } from "@/lib/api-public-route";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// "What can this key see?" — the first call any client makes, and the one that
// tells the caller which of the two shapes the other endpoints will return.
//
// A clone key answers with one model. A fleet key answers with every model, in
// `models[]`, and `model` is null — a fleet key is not "a key for a model", so
// naming one would be a lie a client could build against.
//
// Returns identity only. Config, prompts and tokens are not on this API at all.
export const GET = withModelKey(async ({ tenant }) => {
  const fleet = tenant.scope === "fleet";

  let q = supabaseAdmin.from("clones").select("id,slug,name,status,timezone");
  q = fleet ? q.order("created_at", { ascending: true }) : q.eq("id", tenant.cloneId as string);
  const { data, error } = await q;
  // Never answer ok:true with no model on a database failure: withModelKey turns this into a 500.
  if (error) throw new Error(`clones read failed: ${error.message}`);
  const rows = (data ?? []) as { id: string; slug: string; name: string; status: string; timezone: string }[];

  return publicOk({
    scope: tenant.scope,
    model: fleet ? null : (rows[0] ?? null),
    models: fleet ? rows : null,
    key: { label: tenant.label },
    reads: fleet
      ? "Revenue, payments, stats and fan data for every model. Read only."
      : "Revenue, payments, stats and fan data for this model only. Read only.",
    endpoints: ["/api/v1/me", "/api/v1/revenue", "/api/v1/fans", "/api/v1/payments", "/api/v1/stats"],
  });
});

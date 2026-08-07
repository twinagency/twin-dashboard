import { withModelKey, publicOk } from "@/lib/api-public-route";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// "Whose key is this?" — the first call any client makes, and the one that
// tells a model's dashboard whose data it is about to render.
//
// Returns identity only. Config, prompts and tokens are not on this API at all.
export const GET = withModelKey(async ({ tenant }) => {
  const { data } = await supabaseAdmin
    .from("clones")
    .select("id,slug,name,status,timezone")
    .eq("id", tenant.cloneId)
    .maybeSingle();

  return publicOk({
    model: data
      ? { id: data.id, slug: data.slug, name: data.name, status: data.status, timezone: data.timezone }
      : null,
    key: { label: tenant.label },
    scope: "This key can read revenue and fan data for this model only.",
  });
});

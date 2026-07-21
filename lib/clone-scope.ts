import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase";

// Single global "which clone am I looking at" selector, shared by every data
// page (Revenue/Fans/Info/Drip/Media/Logs). "All" = no cookie = null. Picking a
// clone in the header switcher (components/CloneSwitcher.tsx, via
// app/actions/clone-scope.ts) sets this cookie; pages read it here instead of
// relying on a /clones/[id]/* route param.
export const CLONE_SCOPE_COOKIE = "clone_scope";

// Returns the selected clone id, or null for "All clones". Validates the id
// still exists (a clone can be deleted while selected) so stale cookies fall
// back to "All" instead of every page silently rendering empty/erroring.
export async function getCloneScope(): Promise<string | null> {
  const id = (await cookies()).get(CLONE_SCOPE_COOKIE)?.value || null;
  if (!id) return null;
  const { data } = await supabaseAdmin.from("clones").select("id").eq("id", id).maybeSingle();
  return data ? id : null;
}

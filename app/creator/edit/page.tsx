import CreatorIdentityEditor from "@/components/CreatorIdentityEditor";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { CREATOR_IDENTITY_COLUMNS } from "@/lib/creator-identity-fields";
import { INTAKE_FIELD_KEYS } from "@/lib/intake";
import { serviceClient } from "@/lib/supabase-service";
import type { Clone } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function CreatorEditPage() {
  const creator = await requireCreatorWorkspace();
  const id = creator.cloneIds[0];
  if (!id) return <p className="rounded-xl border border-line bg-panel p-5 text-muted">Identity editing becomes available when your AI creator profile is connected. Your submitted onboarding remains saved.</p>;
  const { data, error } = await serviceClient().from("clones").select(CREATOR_IDENTITY_COLUMNS.join(",")).eq("id", id).maybeSingle();
  if (error || !data) throw new Error("Your identity could not be loaded");
  const row = data as unknown as Partial<Clone> & { updated_at: string };
  // Keep legacy/private keys in storage, but never pass them through a client
  // boundary merely because they happened to live inside the intake JSON.
  const allowed = new Set<string>(INTAKE_FIELD_KEYS);
  const fields = Object.fromEntries(Object.entries(row.intake?.fields || {}).filter(([key, value]) => allowed.has(key) && typeof value === "string"));
  const clone = { ...row, intake: { fields, answers: typeof row.intake?.answers === "string" ? row.intake.answers : "" } };
  return <CreatorIdentityEditor clone={clone} revision={row.updated_at} />;
}

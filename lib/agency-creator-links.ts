import type { AgencyIdentity } from "./agency-identity";
import { getDashboardAccess } from "./dashboard-access";
import { serviceClientForAccess } from "./supabase-service";
import { isLiveAccess, isScopedLiveAgency } from "../deployment/flirt-live-twin.cjs";

export type CreatorBot = { id: string; name: string; slug: string | null };
export type CreatorBotLink = { clone_id: string | null; twin_slug: string | null };
export type CreatorBotOptions = { source: "local" | "twin-live"; clones: CreatorBot[] };

// Intake belongs to the local agency; its operator may separately have access to
// the four live Twin bots. Never infer that access from a submitted ID or slug.
export async function getCreatorBotOptions(intake: AgencyIdentity): Promise<CreatorBotOptions> {
  const dashboard = await getDashboardAccess();
  const live = dashboard?.id === intake.id && (isLiveAccess(dashboard) || isScopedLiveAgency(dashboard));
  const scope = live ? dashboard! : intake;
  if (!scope.cloneIds.length) return { source: live ? "twin-live" : "local", clones: [] };
  const result = await serviceClientForAccess(scope).from("clones")
    .select("id,name,slug").in("id", scope.cloneIds).order("name");
  if (result.error || result.data === null) throw new Error("Available bots could not be loaded");
  const clones = result.data as CreatorBot[];
  if (clones.some(clone => !scope.cloneIds.includes(clone.id) || (live && !clone.slug))) {
    throw new Error("Unexpected bot assignment");
  }
  return { source: live ? "twin-live" : "local", clones };
}

export function resolveCreatorBot(link: CreatorBotLink | undefined, clones: CreatorBot[]): CreatorBot | undefined {
  if (!link) return undefined;
  return link.clone_id
    ? clones.find(clone => clone.id === link.clone_id)
    : link.twin_slug ? clones.find(clone => clone.slug === link.twin_slug) : undefined;
}

export function creatorBotLinkValues(options: CreatorBotOptions, clone: CreatorBot) {
  // Twin IDs cannot satisfy FLIRT's local clones foreign key. The established
  // build pipeline uses a slug-only link for this exact cross-project case.
  return { clone_id: options.source === "twin-live" ? null : clone.id, twin_slug: clone.slug };
}


// Dashboard creator IDs are independent of the live clone-scope cookie.
// Only link records with an established production configuration mapping.
export function isBriannaAdvancedRoute(pathname: string, tab: string | null, sub: string | null = null): boolean {
  const otherLegacySection = sub && ["persona", "media", "engagement", "prompts", "flow"].includes(sub);
  return pathname === "/clones/0328e7b3-a1e5-465a-9a30-c9cf6519cba1" && (sub === "advanced" || (tab === "advanced" && !otherLegacySection));
}

export function isBriannaStudioRoute(pathname: string, tab: string | null, sub: string | null = null): boolean {
  if (pathname !== "/clones/0328e7b3-a1e5-465a-9a30-c9cf6519cba1") return false;
  if (sub && ["prompts", "flow"].includes(sub)) return false;
  if (sub && ["persona", "media", "engagement", "advanced"].includes(sub)) return true;
  return !tab || ["identity", "config", "money", "monetization", "advanced"].includes(tab);
}

export function dashboardCreatorHref(creatorId: string | null, tab = "identity"): string {
  return (creatorId ?? "briana") === "briana"
    ? `/clones/0328e7b3-a1e5-465a-9a30-c9cf6519cba1?tab=${tab}`
    : "/clones";
}

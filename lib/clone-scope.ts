import { getDashboardAccess } from "./dashboard-access";
import { cache } from "react";
import { cookies } from "next/headers";
import { cloneExists } from "./query-cache";

// Single global "which clone am I looking at" selector, shared by every data
// page (Revenue/Fans/Info/Drip/Media/Logs). "All" = no cookie = null. Picking a
// clone in the header switcher (components/CloneSwitcher.tsx, via
// app/actions/clone-scope.ts) sets this cookie; pages read it here instead of
// relying on a /clones/[id]/* route param.
export const CLONE_SCOPE_COOKIE = "clone_scope";

// Returns the selected clone id, or null for "All clones". Validates the id
// still exists (a clone can be deleted while selected) so stale cookies fall
// back to "All" instead of every page silently rendering empty/erroring.
//
// Wrapped in React cache() — per-REQUEST memoization only. Every full page load
// calls this at least twice (app/layout.tsx for the header, then the page
// itself; /logs and /api-access call it again inside their own trees), and each
// call was its own Supabase round trip for the same cookie. Now one render tree
// reads the cookie and validates once.
//
// This memo dies with the request, so it cannot serve one operator's clone
// selection to another. The cross-request half — "does clone X exist" — is
// keyed on the id explicitly inside cloneExists(); see lib/query-cache.ts for
// why that distinction is load-bearing. Nothing cookie-derived is ever cached
// across requests.
export const getCloneScope = cache(async (): Promise<string | null> => {
  const id = (await cookies()).get(CLONE_SCOPE_COOKIE)?.value || null;
  const agency = await getDashboardAccess();
  if (agency) return id && agency.cloneIds.includes(id) ? id : agency.cloneIds.length === 1 ? agency.cloneIds[0] : null;
  if (!id) return null;
  return (await cloneExists(id)) ? id : null;
});


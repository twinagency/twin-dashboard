"use client";

import { useEffect, useState } from "react";
import { setCloneScope } from "@/app/actions/clone-scope";
import type { SharedOverviewCreator } from "./SharedOverview";
import SharedOverview from "@/components/overview/SharedOverview";
import RevenueDashboard from "@/components/RevenueDashboard";
import type { AgencyOverviewPresentation } from "@/lib/agency-overview-model";

export default function FlirtSharedOverview({ cloneId, initialAgency }: { cloneId: string | null; initialAgency: AgencyOverviewPresentation }) {
  const [agency, setAgency] = useState(initialAgency);
  useEffect(() => setAgency(initialAgency), [initialAgency]);
  useEffect(() => {
    const controller = new AbortController();
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/creator-overview", { signal: controller.signal, cache: "no-store" });
        if (response.ok) {
          const body = await response.json();
          if (!controller.signal.aborted && Array.isArray(body.creators)) setAgency(body);
        }
      } catch { /* Keep the current signed portraits until the next refresh. */ }
    }, 300000);
    return () => { clearInterval(interval); controller.abort(); };
  }, []);
  const creators = agency.creators.map(creator => ({ id: creator.id, name: creator.name, color: creator.color,
    photoUrl: creator.portrait?.url, position: creator.portrait?.position, zoom: creator.portrait?.zoom }));
  return <div data-agency-overview="flirt" data-creator-overview={cloneId ?? "all"}>
    <RevenueDashboard cloneId={cloneId} sharedOverview={{ component: SharedOverview, creators, creatorsHref: "/clones", chatHref: "/users", brand: "flirt", creatorOverviewPath: "/revenue" }} />
  </div>;
}

/** Internal operators use the same view with their existing scope action. */
export function FlirtFleetOverview({ cloneId, creators }: { cloneId: string | null; creators: SharedOverviewCreator[] }) {
  return <RevenueDashboard cloneId={cloneId} sharedOverview={{ component: SharedOverview, creators, creatorsHref: "/clones", chatHref: "/users", brand: "flirt", onSelectCreator: setCloneScope }} />;
}

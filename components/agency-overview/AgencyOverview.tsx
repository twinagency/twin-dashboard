"use client";

import { useEffect, useState } from "react";
import SharedOverview from "@/components/overview/SharedOverview";
import RevenueDashboard from "@/components/RevenueDashboard";
import type { OverviewCreator } from "@/lib/agency-overview";

/** Renew private portraits while the shared report retains financial state. */
export default function AgencyOverview({ cloneId, initialCreators, combinedRevenue = false }: { cloneId: string | null; initialCreators: OverviewCreator[]; combinedRevenue?: boolean }) {
  const [creators, setCreators] = useState(initialCreators);
  useEffect(() => setCreators(initialCreators), [initialCreators]);
  useEffect(() => {
    const controller = new AbortController();
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/agency-overview", { signal: controller.signal, cache: "no-store" });
        if (response.ok) {
          const body = await response.json();
          if (!controller.signal.aborted && Array.isArray(body.creators)) setCreators(body.creators);
        }
      } catch { /* Keep the current signed portraits until the next refresh. */ }
    }, 300000);
    return () => { clearInterval(interval); controller.abort(); };
  }, []);
  return <RevenueDashboard cloneId={cloneId} sharedOverview={{ component: SharedOverview, creators, creatorsHref: "/clones", chatHref: "/users", combinedRevenue }} />;
}

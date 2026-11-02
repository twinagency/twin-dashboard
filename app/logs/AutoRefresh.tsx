"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Silently re-fetches the server component every ~30s so new log rows stream in
// without a manual reload. Skips ticks while the tab is hidden.
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}

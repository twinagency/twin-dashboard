"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function EarningsAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [router]);
  return <small>Refreshes every 30 seconds while this page is visible.</small>;
}

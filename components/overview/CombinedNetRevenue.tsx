"use client";

import { useEffect, useState } from "react";
import { parseOverviewOnlyFansRevenue, type OverviewOnlyFansRevenue } from "@/lib/overview-channel-revenue";

type Props = {
  className: string;
  telegramStars: number | null;
  reportWindow?: { startMs: number; endMs: number };
  snapshotAt?: number;
  money: (stars: number) => string;
  moneyWithUsd: (stars: number, usd: number) => string;
};

export default function CombinedNetRevenue({ className, telegramStars, reportWindow, snapshotAt, money, moneyWithUsd }: Props) {
  const start = reportWindow ? new Date(reportWindow.startMs).toISOString() : null;
  const end = reportWindow ? new Date(reportWindow.endMs).toISOString() : null;
  const key = start && end ? start + "/" + end + "/" + snapshotAt : null;
  const [state, setState] = useState<{ key: string; data: OverviewOnlyFansRevenue | null } | null>(null);
  useEffect(() => {
    if (!start || !end || !key) return;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const window = { start, end };
    void (async () => {
      let data: OverviewOnlyFansRevenue | null = null;
      try {
        const response = await fetch("/api/onlyfans/earnings?" + new URLSearchParams(window), {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (response.ok) data = parseOverviewOnlyFansRevenue(await response.json(), window);
      } catch { /* Keep unavailable distinct from an empty connected workspace. */ }
      finally { clearTimeout(timeout); }
      if (active) setState({ key, data });
    })();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [start, end, key]);
  const ready = state?.key === key;
  const data = ready ? state?.data : null;
  const netUsd = data?.netCents == null ? null : data.netCents / 100;
  const total = telegramStars !== null && netUsd !== null ? moneyWithUsd(telegramStars, netUsd) : ready ? "Unavailable" : "Loading...";
  const asOf = data?.asOf ? new Date(data.asOf).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null;
  return <article className={className} data-overview-metric="Net revenue">
    <h3>Net revenue</h3>
    <strong className="money-value" data-overview-combined-total>{total}</strong>
    <small data-overview-channel-breakdown>Telegram {telegramStars === null ? "Unavailable" : money(telegramStars)} · OnlyFans {netUsd === null ? ready ? "Unavailable" : "Loading..." : moneyWithUsd(0, netUsd)}</small>
    {data?.status === "empty" ? <small>No OnlyFans accounts connected</small>
      : data?.status === "unavailable" ? <small role="status">{data.reason}</small>
      : ready && !data ? <small role="status">OnlyFans earnings could not be read. Refresh to retry.</small>
      : data ? <small>{data.includesPending ? "Includes pending OnlyFans earnings" : "After platform fees"}{data.status === "delayed" ? " · Sync delayed" : ""}{asOf ? " · OnlyFans synced " + asOf + " AEST" : ""}</small>
      : null}
  </article>;
}

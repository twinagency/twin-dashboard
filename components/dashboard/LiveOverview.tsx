"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Coins, MessageCircle, UserRound, Users } from "lucide-react";
import CloneSwitcher from "@/components/CloneSwitcher";
import CurrencyToggle from "@/components/CurrencyToggle";
import BlurToggle from "@/components/BlurToggle";
import FanAvatar from "@/components/FanAvatar";
import RankingPanel from "@/components/overview-rankings/RankingPanel";
import type { DashboardData } from "@/lib/dashboard-data";
import { REPORT_TZ, reportTzLabel } from "@/lib/report-time";
import styles from "./LiveOverview.module.css";

export type OverviewClone = { id: string; name: string; color: string; photoUrl?: string };

function CreatorPhoto({ creator }: { creator: OverviewClone }) {
  const [failed, setFailed] = useState(false);
  return creator.photoUrl && !failed
    ? <img src={creator.photoUrl} alt={creator.name} onError={() => setFailed(true)} />
    : <span className={styles.initials} aria-label={creator.name}><UserRound /></span>;
}

export function LiveOverviewHero({ clones, cloneId, windowLabel }: {
  clones: OverviewClone[]; cloneId?: string | null; windowLabel: string;
}) {
  const creator = clones.find(c => c.id === cloneId);
  return <>
    <header className={styles.toolbar}>
      <div className={styles.selector}><CloneSwitcher clones={clones} activeCloneId={cloneId ?? null} /></div>
      <div className={styles.tools}><span className={styles.source}><i />Live Telegram data</span><CurrencyToggle /><BlurToggle /></div>
    </header>
    <section className={`${styles.hero} ${creator ? styles.creatorHero : ""}`} aria-label="Dashboard overview">
      <div className={styles.heroCopy}>
        <p>{creator ? "CREATOR OVERVIEW" : "DASHBOARD OVERVIEW"}</p>
        <h1 className={creator ? "creator-name" : ""}>{creator?.name ?? "Your creators, at a glance."}</h1>
        <span>{windowLabel} · Earnings, fans and activity in one place.</span>
        <div className={styles.heroLinks}><Link href={creator ? `/clones/${creator.id}?tab=identity` : "/clones"}>{creator ? "View creator" : "View creators"}<ArrowRight size={16} /></Link><Link className={styles.secondaryLink} href="/users">Live Telegram Chat<MessageCircle size={16} /></Link></div>
      </div>
      {creator ? <div className={styles.heroPortrait}><CreatorPhoto key={creator.id} creator={creator} /></div> : <div className={styles.fleetArt} aria-label={`${clones.length} creators`}><div className={styles.portraits}>{clones.slice(0, 4).map(c => <div key={c.id}><CreatorPhoto creator={c} /></div>)}</div><span><Users size={16} />{clones.length.toLocaleString()} creators</span></div>}
    </section>
  </>;
}

const labels: Record<string, string> = { credits: "Paid messages", photo: "Photo", video: "Video", bundle: "Bundle", media: "Media", tip: "Tip", subscription: "Subscription", refund: "Adjustment", other: "Payment" };

export function LiveOverviewActivity({ data, cloneId, money }: {
  data: DashboardData | null; cloneId?: string | null; money: (stars: number) => string;
}) {
  const recent = data?.recent.filter(row => !cloneId || row.cloneId === cloneId).slice(0, 4) ?? [];
  return <section className={styles.activity} aria-label="Recent purchases">
    <header><h2>Recent purchases</h2><a href="#overview-transactions">View all<ArrowRight size={14} /></a></header>
    {recent.map((row, i) => <a className={styles.activityRow} href="#overview-transactions" key={`${row.cloneId}:${row.telegramId}:${row.paidAt}:${i}`}>
      <FanAvatar cloneId={row.cloneId} telegramId={row.telegramId} name={row.buyerName} color={row.cloneColor} className="h-10 w-10" />
      <div><strong>{row.buyerName}</strong><span><span className="creator-name">{row.cloneName}</span> · {labels[row.kind] ?? row.kind}</span><time dateTime={row.paidAt}>{new Date(row.paidAt).toLocaleString("en-AU", { timeZone: REPORT_TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} {reportTzLabel(new Date(row.paidAt))}</time></div>
      <b className="money-value">{money(row.stars)}</b>
    </a>)}
    {!recent.length && <p className={styles.empty}>{data ? "No recorded purchases in this period." : "Loading purchases…"}</p>}
    <Link className={styles.activityLink} href={cloneId ? `/clones/${cloneId}?tab=ppvs` : "/media"}><Coins size={16} />Open PPV content<ArrowRight size={14} /></Link>
  </section>;
}

export function LiveOverviewRankings({ data, cloneId, money, loading }: {
  data: DashboardData | null; cloneId?: string | null; money: (stars: number) => string; loading: boolean;
}) {
  const ids = cloneId ? [cloneId] : data?.clones.map(c => c.id) ?? [];
  return <div className={styles.rankings}>
    {(["fans", "content"] as const).map(kind => <RankingPanel key={kind} kind={kind} rankings={data?.rankings} cloneIds={ids} agency={!cloneId} money={money} loading={loading} error={data?.rankingsError} />)}
  </div>;
}

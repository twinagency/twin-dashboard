"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Coins, UserRound, Users } from "lucide-react";
import { setCloneScope } from "@/app/actions/clone-scope";
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

function CreatorShortcuts({ clones }: { clones: OverviewClone[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function openCreator(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        await setCloneScope(id);
        router.refresh();
      } catch {
        setError("Could not open this creator. Please try again.");
      }
    });
  }

  return <div className={styles.fleetArt}>
    <nav className={styles.portraits} aria-label="Creator dashboards" aria-busy={pending}>
      {clones.slice(0, 5).map(c => <button
        key={c.id}
        type="button"
        className={`${styles.creatorShortcut} creator-name`}
        onClick={() => openCreator(c.id)}
        disabled={pending}
        aria-label={`Open ${c.name} dashboard`}
        title={c.name}
      >
        <span className={styles.shortcutPhoto}><CreatorPhoto creator={c} /></span>
        <span className={styles.shortcutName}>{c.name}</span>
      </button>)}
      <Link className={`${styles.creatorShortcut} ${styles.viewMore}`} href="/clones">
        <span className={styles.morePhoto}>
          <Users size={24} aria-hidden="true" />
        </span>
        <span className={styles.shortcutName}>View all</span>
      </Link>
    </nav>
    <span><Users size={16} />{clones.length.toLocaleString()} creators</span>
    {error && <p className={styles.shortcutError} role="alert">{error}</p>}
  </div>;
}

export function LiveOverviewHero({ clones, cloneId, windowLabel }: {
  clones: OverviewClone[]; cloneId?: string | null; windowLabel: string;
}) {
  const creator = clones.find(c => c.id === cloneId);
  return <>
    <section className={`${styles.hero} ${creator ? styles.creatorHero : ""}`} aria-label="Dashboard overview">
      <div className={styles.heroCopy}>
        <h1 className={creator ? "creator-name" : ""}>{creator?.name ?? "Overview"}</h1>
        <span>{windowLabel} · Your creators, earnings and activity.</span>
      </div>
      {creator ? <div className={styles.heroPortrait}><CreatorPhoto key={creator.id} creator={creator} /></div> : <CreatorShortcuts clones={clones} />}
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

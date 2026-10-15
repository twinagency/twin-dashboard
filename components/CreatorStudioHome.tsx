"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Check, CheckCircle2, CircleHelp, Clock3, Images, MessageCircle, RefreshCw, Sparkles, Users, Wallet } from "lucide-react";
import { useCurrency } from "./CurrencyProvider";
import { StudioAvatar } from "./CreatorStudioShell";
import { fmtMoney, fmtNum, STAR_USD } from "@/lib/money";
import { readStudioPerformance, STUDIO_PERIODS, type CreatorStudioBrand, type CreatorStudioStatus, type StudioPerformance, type StudioPeriod } from "@/lib/creator-studio-model";
import styles from "./CreatorStudio.module.css";

export default function CreatorStudioHome({ brand, name, cloneId, photoUrl, status, contentHref, readOnly = false }: {
  brand: CreatorStudioBrand; name: string; cloneId: string | null; photoUrl?: string; status: CreatorStudioStatus; contentHref: string; readOnly?: boolean;
}) {
  const firstName = name.trim().split(/\s+/)[0] || "creator";
  const draft = status.phase === "draft";
  const needsHelp = status.phase === "changes" || status.phase === "withdrawn";
  const myAiHref = cloneId ? "/creator/edit" : "/creator/onboarding?step=questionnaire";
  return <div data-creator-studio-home data-setup-phase={status.phase}>
    <div className={styles.heading}><div><p className={styles.eyebrow}>YOUR CREATOR STUDIO</p><h1>{cloneId ? `Looking good, ${firstName}.` : `Your studio, ${firstName}.`}</h1><p>{cloneId ? "Your earnings, your content, your next chapter." : "Everything you need for what comes next."}</p></div></div>
    {cloneId ? <>
      <section className={styles.profileStrip}><StudioAvatar name={name} photoUrl={photoUrl} /><div><h2>{status.phase === "paused" ? "Your AI is paused." : status.phase === "ready" ? "Your AI profile is ready." : "Your AI profile is connected."}</h2><p>{status.phase === "paused" ? "Your past performance is still available below." : "Your personality, always part of the conversation."}</p></div><Link className={styles.secondaryButton} href={myAiHref}>{readOnly ? "My AI details" : "View my AI"}<ArrowRight size={16} /></Link></section>
      <StudioPerformanceOverview cloneId={cloneId} />
    </> : <div className={styles.homeGrid}>
      <section className={styles.welcome} data-creator-clone-building={!draft && !needsHelp ? "true" : undefined}>
        <div className={styles.decoration} aria-hidden="true" />
        <span className={styles.miniLabel}>{draft ? <Sparkles size={16} /> : <CheckCircle2 size={16} />}{status.label}</span>
        <h2>{draft ? <>Let’s make this<br />feel like <em>you.</em></> : needsHelp ? <>Let’s take the<br /><em>next step.</em></> : <>You’re in.<br />Let’s make it <em>yours.</em></>}</h2>
        <p>{draft ? "Bring your content and personality together. Complete your setup whenever you’re ready." : status.phase === "reviewing" ? "Your details are being reviewed. You can keep adding content while your creator profile takes shape." : status.phase === "approved" ? "Your onboarding is approved. Your performance overview will appear here when your AI profile is connected." : needsHelp ? "Check your onboarding status and contact your agency team for the next steps." : `Thanks for joining ${brand === "moxy" ? "Moxy" : "Flirt"}. Your onboarding has been received. Your next chapter starts here.`}</p>
        <Link className={styles.primaryButton} href={draft ? "/creator/onboarding" : needsHelp ? "/creator/help" : contentHref} data-return-to-onboarding={draft ? "true" : undefined} data-finish-onboarding={draft ? "true" : undefined}>{draft ? "Continue setup" : needsHelp ? "Help & support" : "Explore your content"}<ArrowRight size={16} /></Link>
      </section>
      <section className={styles.timelineCard}><h2>{draft ? "Two steps. All you." : "Your next chapter"}</h2>
        {needsHelp ? <div className={styles.notice}><h3>{status.label}</h3><p>Open your account information to see the current application status.</p><Link href="/creator/info">View account information <ArrowRight size={15} /></Link></div> : <ol className={styles.timeline}>
          {(draft ? [
            { title: "Your content", copy: "Add photos, videos or a folder link.", done: false, current: true },
            { title: "Your personality", copy: "Tell us what makes you, you.", done: false, current: false },
          ] : [
            { title: "Onboarding received", copy: "Your information is with us.", done: true, current: false },
            { title: status.phase === "approved" ? "Profile approved" : status.phase === "reviewing" ? "Under review" : "Review comes next", copy: status.phase === "approved" ? "Your details have been approved." : status.phase === "reviewing" ? "Your team is reviewing your details." : "Your submission is ready for your team.", done: status.phase === "approved", current: status.phase === "reviewing" },
            { title: "Your AI is ready", copy: "Your performance overview opens here.", done: false, current: status.phase === "approved" },
          ]).map((step, index) => <li key={step.title} data-current={step.current} data-done={step.done}><span className={styles.stepCircle}>{step.done ? <Check size={14} /> : step.current ? <Clock3 size={14} /> : index + 1}</span><div><h3>{step.title}</h3><p>{step.copy}</p></div></li>)}
        </ol>}
        <p className={styles.timelineFooter}>{draft ? "Come back and finish at any time." : "Your status updates automatically here."}</p>
      </section>
    </div>}
    <div className={styles.sectionHeading}><h2>{cloneId ? "Keep the momentum." : "Make yourself at home."}</h2><p>Your next little update.</p></div>
    <div className={styles.actionGrid}>
      <ActionCard icon="content" title="Your content" copy="Your photos and videos, together in one place." link="Open my content" href={contentHref} />
      <ActionCard icon="ai" title="Your personality" copy={readOnly ? "See the details of your connected AI profile." : "Your interests, your style, your boundaries."} link={readOnly ? "View my profile" : "Review my profile"} href={myAiHref} />
      <ActionCard icon={cloneId ? "earnings" : "help"} title={cloneId ? "See your progress" : "We’re here for you"} copy={cloneId ? "Take a closer look at your creator earnings." : "A little guidance, whenever you need it."} link={cloneId ? "View earnings" : "Help & support"} href={cloneId ? "/creator/earnings" : "/creator/help"} />
    </div>
    {!cloneId && <section className={styles.profileStrip}><StudioAvatar name={name} photoUrl={photoUrl} /><div><h2>{name}</h2><p>Your creator account</p></div><Link className={styles.textLink} href="/creator/info">Account details <ArrowRight size={15} /></Link></section>}
  </div>;
}

function ActionCard({ icon, title, copy, link, href }: { icon: string; title: string; copy: string; link: string; href: string }) {
  const Icon = icon === "content" ? Images : icon === "ai" ? Sparkles : icon === "earnings" ? Wallet : CircleHelp;
  return <Link className={styles.actionCard} href={href} data-creator-content-access={icon === "content" ? "true" : undefined} data-creator-onboarding-access={icon === "ai" ? "true" : undefined}><span className={styles.iconTile}><Icon size={20} /></span><h3>{title}</h3><p>{copy}</p><span className={styles.cardFooter}>{link}<ArrowRight size={16} /></span></Link>;
}

export function StudioPerformanceOverview({ cloneId }: { cloneId: string }) {
  const [period, setPeriod] = useState<StudioPeriod>("1M");
  const [data, setData] = useState<StudioPerformance | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const { currency, rate, usdPerStar = STAR_USD } = useCurrency() as ReturnType<typeof useCurrency> & { usdPerStar?: number };
  const gradientId = `studio-earnings-${useId().replace(/:/g, "")}`;
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    setData(null); setError(false); setLoading(true);
    const refresh = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const params = new URLSearchParams({ period, clone: cloneId });
        const response = await fetch(`/api/dashboard?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Performance is unavailable.");
        const next = readStudioPerformance(await response.json(), cloneId, period);
        if (!controller.signal.aborted) { setData(next); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { running = false; if (!controller.signal.aborted) setLoading(false); }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [cloneId, period, retry]);
  const amount = (stars: number) => stars * usdPerStar * (currency === "AUD" ? rate : 1);
  const chart = data?.series.map(row => ({ bucket: row.bucket, earnings: amount(row.stars) })) || [];
  const metricValue = (value: number | undefined, money = false) => value == null ? loading ? "…" : "Unavailable" : money ? fmtMoney(amount(value), currency) : fmtNum(value);
  return <section className={styles.performance} aria-label="Performance overview" aria-busy={loading}>
    <div className={styles.sectionHeading}><h2>Performance overview</h2><div className={styles.periods} role="group" aria-label="Reporting period">{STUDIO_PERIODS.map(item => <button key={item.key} aria-pressed={period === item.key} onClick={() => setPeriod(item.key)}>{item.label}</button>)}</div></div>
    {error && <div className={styles.error} role="alert"><span>{data ? "The latest update could not be loaded. Showing the last successful update." : "We couldn’t load your performance. Please try again."}</span><button onClick={() => setRetry(value => value + 1)}><RefreshCw size={15} />Try again</button></div>}
    <div className={styles.statsGrid}>
      {[
        { title: "Your earnings", value: metricValue(data?.stars, true), note: "Your share for this period", icon: Wallet },
        { title: "Active fans", value: metricValue(data?.activeFans), note: "Fans who sent a message", icon: Users },
        { title: "Conversations", value: metricValue(data?.conversations), note: "Chats active in this period", icon: MessageCircle },
      ].map(({ title, value, note, icon: Icon }) => <article key={title} className={styles.statCard}><div>{title}<Icon size={19} /></div><strong>{value}</strong><p>{note}</p></article>)}
    </div>
    <section className={styles.chartPanel}>
      <div className={styles.sectionHeading}><div><h2>A little progress, every day.</h2><p>Your earnings · {currency} · {STUDIO_PERIODS.find(item => item.key === period)?.label}</p></div><span className={styles.chartKey}>Your earnings</span></div>
      {data && chart.length ? <div className={styles.chart} role="img" aria-label={`Your earnings over ${STUDIO_PERIODS.find(item => item.key === period)?.label}: ${fmtMoney(amount(data.stars), currency)}.`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{ top: 12, right: 15, bottom: 0, left: 0 }}><defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--studio-accent)" stopOpacity={0.18} /><stop offset="100%" stopColor="var(--studio-accent)" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="var(--studio-line)" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="bucket" axisLine={false} tickLine={false} minTickGap={60} tick={{ fontSize: 11, fill: "var(--studio-muted)" }} /><YAxis axisLine={false} tickLine={false} width={58} tick={{ fontSize: 11, fill: "var(--studio-muted)" }} tickFormatter={value => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(Number(value))} /><Tooltip formatter={(value: number) => [fmtMoney(value, currency), "Your earnings"]} contentStyle={{ borderRadius: 12, border: "1px solid var(--studio-line)", fontSize: 12 }} /><Area type="linear" dataKey="earnings" stroke="var(--studio-accent)" strokeWidth={2.5} fill={`url(#${gradientId})`} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div> : <div className={styles.chartEmpty}>{loading ? "Loading your earnings…" : error ? "Your earnings chart will return when the data is available." : "No earnings recorded in this period yet."}</div>}
      <div className={styles.chartFooter}><span>{loading ? "Loading your data…" : data?.stale ? "Refreshing the latest data…" : data ? "Updates automatically every minute" : "Your own creator activity appears here"}</span><Link href="/creator/earnings">View full earnings <ArrowRight size={14} /></Link></div>
    </section>
  </section>;
}

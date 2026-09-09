import type { Metadata } from "next";
import type { ReactNode } from "react";
import IntelligenceCoreIcon from "@/components/IntelligenceCoreIcon";
import AvaMotion from "./AvaMotion";
import "./ava.css";
import "./ava-mobile.css";
import "./ava-motion.css";

export const metadata: Metadata = {
  title: "Ava | AI clones for creators",
  description: "Your personality. Your content. A new way to connect with your fans on Telegram.",
  robots: { index: false, follow: false },
};

const paths = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  back: "m14 6-6 6 6 6",
  down: "m6 9 6 6 6-6",
  menu: "M4 6h16M4 12h16M4 18h16",
  send: "m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13",
  chat: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3",
  mic: "M9 3h6v12H9zM5 11v3a7 7 0 0 0 14 0v-3M12 21v-3",
  attach: "m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2",
  play: "m8 5 11 7-11 7V5Z",
  check: "m5 12 4 4L19 6",
  ticks: "m2 12 4 4L16 6m-5 10 10-10",
  more: "M12 4h.01M12 12h.01M12 20h.01",
  photo: "M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M8 7h.01",
  chart: "M5 20v-8M12 20V4M19 20V9",
  line: "m3 17 6-7 5 3 7-10",
  money: "M12 2v20m5-16H9a4 4 0 0 0 0 8h6a4 4 0 0 1 0 8H6",
  users: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M21 21v-3a4 4 0 0 0-3-4M13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm5-4a4 4 0 0 1 0 8",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  business: "M3 8h18v13H3zM8 8V3h8v5M3 13h18",
  flow: "M4 3h6v6H4zM14 15h6v6h-6zM7 9v9h7",
  edit: "m4 16 12-12 4 4L8 20H4v-4ZM13 7l4 4",
  info: "M12 8h.01M12 12v5M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  logs: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  logout: "M9 3H3v18h6M8 12h13m-5-5 5 5-5 5",
  calendar: "M3 5h18v16H3zM3 10h18M8 2v6M16 2v6",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
} as const;
function Icon({ name, className = "" }: { name: keyof typeof paths; className?: string }) {
  return <svg className={`ava-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function PreviewButton({ children, light = false, ghost = false }: { children: ReactNode; light?: boolean; ghost?: boolean }) {
  return <button type="button" aria-disabled="true" title="Design preview. Onboarding is not connected yet." className={`ava-button ${light ? "cream" : ghost ? "ghost" : "solid"}`}>{children}{!ghost && <Icon name="arrow" />}</button>;
}
const links = [["#top", "Home"], ["#how", "How It Works"], ["#features", "Features"], ["#results", "Dashboard"], ["#faq", "FAQ"]];
function Navigation() { return <>{links.map(([href, label]) => <a key={href} href={href}>{label}</a>)}</>; }
function Bubble({ children, outgoing = false, time }: { children: ReactNode; outgoing?: boolean; time: string }) {
  return <div className={`ava-bubble ${outgoing ? "me" : "them"}`}><span className="ava-bubble-copy">{children}</span><span className="ava-message-time">{time}{outgoing && <Icon name="ticks" />}</span></div>;
}
function TelegramPhone({ secondary = false }: { secondary?: boolean }) {
  const creator = secondary ? "Sienna Rose" : "Mia Vale";
  return <div className={`ava-phone ${secondary ? "ava-phone-secondary" : ""}`} aria-label={`Illustrative Telegram chat with fictional creator ${creator}`}>
    <div className="ava-phone-screen">
      <div className="ava-statusbar"><span>9:41</span><i className="ava-island" /><span className="ava-status-icons"><i className="ava-signal"/><svg viewBox="0 0 18 14" aria-hidden="true"><path d="M1 4Q9-2 17 4M4 7q5-4 10 0M7 10q2-2 4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="9" cy="12" r="1" fill="currentColor"/></svg><i className="ava-battery"/></span></div>
      <div className="ava-telegram-topbar"><Icon name="back"/><div className="ava-chat-name"><strong>{creator}</strong><small>{secondary ? "last seen recently" : "online"}</small></div><span className={`ava-avatar ${secondary ? "sienna" : "mia"}`}>{secondary ? "SR" : "MV"}</span></div>
      <div className="ava-chat" data-ava-scroll={secondary ? undefined : "preview"}><div className="ava-chat-history"><span className="ava-chat-day">Today</span>
        {secondary ? <>
          <Bubble outgoing time="10:24">You’re amazing 😍</Bubble>
          <div className="ava-voice"><span className="ava-play"><Icon name="play"/></span><div><div className="ava-wave">{[8,13,20,11,17,24,14,9,18,23,13,19,10,17,22,12,7,15].map((h,i)=><i key={i} style={{height:h}}/>)}</div><small>0:24</small></div><span className="ava-message-time">10:24</span></div>
          <Bubble time="10:25">Should I send you a custom video?</Bubble>
          <Bubble outgoing time="10:25">Yes please 🔥</Bubble>
          <div className="ava-content-card compact"><div className="ava-content-blur"/><div className="ava-lock"><Icon name="lock"/><small>Tap to unlock</small></div><span className="ava-media-caption">Just for you 💗</span></div>
        </> : <>
          <Bubble time="10:24">Hey handsome 💕<br/>Good to see you here...</Bubble>
          <Bubble outgoing time="10:25">You got any new content? 😏</Bubble>
          <Bubble time="10:25">I do... want a little preview? 😉</Bubble>
          <div className="ava-content-card"><div className="ava-content-blur"/><div className="ava-lock"><Icon name="lock"/><small>Tap to unlock</small></div><span className="ava-media-time">10:26</span></div>
          <Bubble time="10:26">This set is so hot 🔥</Bubble>
          <button className="ava-unlock" type="button" aria-disabled="true">Unlock for $12</button>
        </>}
      </div></div>
      <div className="ava-message-bar"><Icon name="attach"/><span>Message <i>◯</i></span><Icon name="mic"/></div><div className="ava-phone-bottom"><i/></div>
    </div>
  </div>;
}

// Static, fictional presentation data only. Never connected to the private ledger.
const demoRevenue = 384729.84;
const demoBalance = 72441.18;
const weights = [43,55,48,62,80,74,57,69,91,86,78,105,96,122,110,89,107,131,144,126,150,169,157,145,182,161,174,198,181];
const weightTotal = weights.reduce((sum, n) => sum + n, 0);
const dailyCents = weights.map(n => Math.floor(n / weightTotal * Math.round(demoRevenue * 100)));
dailyCents[dailyCents.length - 1] += Math.round(demoRevenue * 100) - dailyCents.reduce((sum, n) => sum + n, 0);
const aud = (value: number) => `A$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stats = [["All-time users", "184,209"], ["New users", "28,941"], ["Users who messaged", "162,774"], ["Revenue / user who messaged", aud(demoRevenue / 162774)], ["Purchases", "24,892"], ["Active users (24h)", "4,218"]];
const sidebar: [keyof typeof paths, string][] = [["money","Earnings"],["grid","Creators"],["users","Fans"],["photo","PPVs"],["business","Business"],["flow","Flows"],["edit","Edit"],["info","Info"],["logs","Logs"]];
function DashboardMockup() {
  return <figure className="ava-dashboard-preview" id="results" aria-label="Ava earnings dashboard with fictional sample data">
    <div className="ava-dashboard-frame">
      <aside className="ava-dashboard-sidebar" aria-label="Dashboard preview navigation">
        <div className="ava-dashboard-brand">Ava</div>
        <div className="ava-dashboard-core"><IntelligenceCoreIcon size={68}/><span>AI Intelligence<strong>CORE</strong></span></div>
        <div className="ava-dashboard-nav">{sidebar.map(([icon,label],i)=><div key={label}>{i===5 && <small>MORE</small>}<span className={i===0?"active":""}><Icon name={icon}/>{label}</span></div>)}</div>
      </aside>
      <div className="ava-dashboard-main">
        <div className="ava-dashboard-topbar"><span className="ava-dashboard-breadcrumb">Mia Vale <i>/ Earnings</i></span><span className="ava-dashboard-mobile-brand">Ava</span><div className="ava-dashboard-account"><span className="ava-demo-avatar">MV</span><b>Mia Vale</b><Icon name="down"/><span className="ava-account-balance">{aud(demoBalance)}</span><span className="ava-currency">AUD</span><Icon name="eye"/><span className="ava-signout"><Icon name="logout"/>Sign out</span></div></div>
        <div className="ava-dashboard-body">
          <div className="ava-dashboard-heading"><div><h3>Earnings overview</h3><p>Updated just now <span>Refresh</span></p></div><span className="ava-demo-badge">Demo data</span></div>
          <div className="ava-dashboard-filters" aria-label="Illustrative timeframe controls"><div className="ava-dashboard-periods">{['All','1Y','6M','3M','1M','2W','1W','1D'].map(x=><span key={x} className={x==='1M'?'active':''}>{x==='1D'&&<i/>}{x}</span>)}<span><Icon name="calendar"/>Custom</span></div><span className="ava-chart-switch"><Icon name="chart"/><Icon name="line"/></span></div>
          <div className="ava-earnings-card">
            <div className="ava-earnings-description">Mia Vale · Star revenue, 1M <Icon name="info"/></div>
            <div className="ava-earnings-values"><div className="ava-revenue-value"><small className="ava-mobile-label">Revenue this month</small><strong>{aud(demoRevenue)}</strong></div><div className="ava-stars-value"><small>Telegram Stars</small><strong><span>⭐</span>19,236,492</strong></div></div>
            <div className="ava-balance-value"><small>Total balance <Icon name="info"/></small><strong>{aud(demoBalance)} <span>· ⭐ 3,622,059</span></strong></div>
            <div className="ava-chart" role="img" aria-label="Illustrative daily revenue from August 12 to September 9, totalling A$384,729.84"><div className="ava-y-axis"><span>A$25k</span><span>A$18.75k</span><span>A$12.5k</span><span>A$6.25k</span><span>A$0</span></div><div className="ava-chart-plot"><div className="ava-chart-grid">{[0,1,2,3,4].map(i=><i key={i}/>)}</div><div className="ava-dashboard-bars">{dailyCents.map((n,i)=><i key={i} style={{height:`${n/25000}%`}}/>)}</div></div><div className="ava-x-axis"><span>Aug 12</span><span>Aug 19</span><span>Aug 26</span><span>Sep 2</span><span>Sep 9</span></div></div>
          </div>
          <div className="ava-day-analysis"><div><strong>Daily earnings analysis compared to previous days &amp; weeks</strong><p>Review buyers, orders, audience activity and product mix for any day.</p></div><span>Open <Icon name="down"/></span></div>
          <div className="ava-dashboard-stats">{stats.map(([label,value],i)=><article key={label} className={i===4||i===5?"ava-stat-mobile":""}><small>{label}<Icon name="info"/></small><strong>{value}</strong></article>)}</div>
        </div>
      </div>
    </div>
    <figcaption>Illustrative dashboard. Figures and creator profiles are fictional, not actual earnings.</figcaption>
  </figure>;
}
const features: [keyof typeof paths, string, string][] = [["send","Built for Telegram","Conversations in the app your fans already use."],["chat","Your personality","Chats shaped around your tone and style."],["photo","Your content","Photos, videos and bundles in the conversation."],["chart","Clear insights","Messages, buyers and earnings, all in one place."],["spark","Fully managed","We handle the technology. You keep creating."]];
export default function AvaPage() {
  return <main className="ava-site" data-ava-revision="motion-scroll-20260910">
    <header className="ava-header"><a className="ava-wordmark" href="#top" aria-label="Ava home">Ava</a><nav aria-label="Main navigation"><Navigation/></nav><div className="ava-header-actions"><PreviewButton>Get Started</PreviewButton><details className="ava-mobile-nav"><summary aria-label="Open navigation"><Icon name="menu"/></summary><nav aria-label="Mobile navigation"><Navigation/></nav></details></div></header>
    <section id="top" className="ava-hero">
      <div className="ava-hero-copy"><div className="ava-eyebrow">AI clones for real creators</div><h1>Your Fans.<br/>Your Rules.<br/><em>More Revenue.</em></h1><p>Ava builds AI clones for creators that chat, sell content and grow your income 24/7 on Telegram.</p><div className="ava-hero-actions"><PreviewButton>Get Started</PreviewButton><PreviewButton ghost>Book a Call</PreviewButton></div><div className="ava-platform-note"><span><Icon name="send"/></span><div><strong>Built for Telegram.</strong><small>Your personality. A new way to connect.</small></div></div></div>
      <div className="ava-hero-visual"><div className="ava-phone-stage"><TelegramPhone/><TelegramPhone secondary/></div><p className="ava-chat-disclaimer">Example conversations · Fictional creators</p></div>
    </section>
    <section className="ava-capabilities" aria-label="Platform overview">{[["24/7","Conversations"],["Your voice","Your personality"],["Your content","Your pricing"],["One dashboard","Complete visibility"]].map(([value,label])=><div key={value}><strong>{value}</strong><span>{label}</span></div>)}</section>
    <section id="how" className="ava-product-section"><div className="ava-product-copy"><div className="ava-eyebrow light">Creator growth platform</div><h2>Everything You Need<br/>to Scale as a Creator.</h2><p>Ava handles the conversations, sells your content and builds real relationships with your fans, so you can focus on creating.</p><ul><li><Icon name="check"/>Autonomous AI chat on Telegram</li><li><Icon name="check"/>Sells photos, videos, bundles and customs</li><li><Icon name="check"/>Learns your style, tone and personality</li><li><Icon name="check"/>24/7 operation with full analytics</li><li><Icon name="check"/>Fully managed setup and support</li></ul><PreviewButton light>Get Started</PreviewButton></div><DashboardMockup/></section>
    <section className="ava-features-section" id="features"><div className="ava-section-intro"><div className="ava-eyebrow">Less admin. More you.</div><h2>The details that make it yours.</h2></div><div className="ava-features">{features.map(([icon,title,copy])=><article key={title}><span className="ava-feature-icon"><Icon name={icon}/></span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <section className="ava-personality"><span className="ava-personality-mark" aria-hidden="true">Ava</span><div><div className="ava-eyebrow">Built around you</div><h2>Your personality.<br/>Not another template.</h2><p>Your tone, your content, your boundaries. A creator experience that feels like an extension of you.</p></div></section>
    <section className="ava-faq" id="faq"><div><div className="ava-eyebrow">A few things to know</div><h2>Before you get started.</h2></div><div className="ava-faq-items"><details><summary>Where do fans talk to my AI clone?<Icon name="down"/></summary><p>On Telegram, in a one-to-one conversation with your creator bot.</p></details><details><summary>What does the dashboard show?<Icon name="down"/></summary><p>Earnings, balances, buyers, messages and audience activity. The example above uses fictional figures to demonstrate the layout.</p></details><details><summary>Can I sign up through this preview?<Icon name="down"/></summary><p>Not yet. This is a front-end preview. Signup, onboarding and payments are not connected.</p></details></div></section>
    <section className="ava-final-cta"><div className="ava-eyebrow light">Your next chapter</div><h2>Ready to Scale with Ava?</h2><PreviewButton light>Get Started</PreviewButton></section>
    <footer className="ava-footer"><a className="ava-wordmark" href="#top">Ava</a><nav aria-label="Footer navigation"><Navigation/></nav><small>© 2026 Ava. Front-end preview.</small></footer>
    <AvaMotion/>
  </main>;
}

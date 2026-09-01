import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BadgeCheck,
  BellRing,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Flame,
  Layers3,
  MessageCircle,
  MoreHorizontal,
  PlayCircle,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingUp,
  UserRound,
  UsersRound,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type CrmPreviewView = "inbox" | "fans" | "campaigns" | "team" | "platforms";

type Tone = "navy" | "blue" | "green" | "pink" | "slate" | "gold";

const TONE: Record<Tone, string> = {
  navy: "bg-[#06172f] text-white",
  blue: "bg-[#e6f3fb] text-[#176596]",
  green: "bg-[#e4f7f1] text-[#087a61]",
  pink: "bg-[#fff0f7] text-[#b62b70]",
  slate: "bg-[#eef4f8] text-[#3f5d76]",
  gold: "bg-[#fff7dc] text-[#966b05]",
};

const tabs: { view: CrmPreviewView; href: string; label: string }[] = [
  { view: "inbox", href: "/crm/inbox", label: "Inbox" },
  { view: "fans", href: "/crm/fans", label: "Fan CRM" },
  { view: "campaigns", href: "/crm/campaigns", label: "Campaigns" },
  { view: "team", href: "/crm/team", label: "Team" },
  { view: "platforms", href: "/crm/platforms", label: "Platforms" },
];

function Dot({ tone = "green" }: { tone?: "green" | "blue" | "pink" | "gold" }) {
  const colour = { green: "bg-good", blue: "bg-info", pink: "bg-love", gold: "bg-[#d69a08]" }[tone];
  return <span className={`inline-block size-2 rounded-full ${colour}`} />;
}

function Avatar({ name, tone = "navy", size = "md" }: { name: string; tone?: Tone; size?: "sm" | "md" | "lg" }) {
  const dimension = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-11 text-sm" }[size];
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return <span className={`grid shrink-0 place-items-center rounded-full font-semibold ${dimension} ${TONE[tone]}`}>{initials}</span>;
}

function Metric({ label, value, note, tone = "navy", icon: Icon }: { label: string; value: string; note: string; tone?: Tone; icon: LucideIcon }) {
  return (
    <Card className="min-w-0 gap-0 rounded-xl py-4">
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted">{label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-ink tabular-nums">{value}</div>
          <div className="mt-1 text-xs text-muted">{note}</div>
        </div>
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${TONE[tone]}`}><Icon className="size-4" /></span>
      </CardContent>
    </Card>
  );
}

function PageHeader({ title, detail, action }: { title: string; detail: string; action?: string }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-accent-2">
          <span className="size-1.5 rounded-full bg-love" /> CRM workspace
        </div>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.045em] text-ink sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{detail}</p>
      </div>
      {action ? <div className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white shadow-[0_12px_22px_rgb(6_23_47/0.16)]"><Plus className="size-4" />{action}</div> : null}
    </div>
  );
}

function CrmTabs({ view }: { view: CrmPreviewView }) {
  return (
    <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line/80 bg-white/70 p-1 shadow-[0_8px_24px_rgb(6_23_47/0.04)]">
      {tabs.map((tab) => (
        <Link
          key={tab.view}
          href={tab.href}
          className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab.view === view ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-elev/70 hover:text-ink"}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

function QuickSearch({ text = "Search fans, conversations, tags…" }: { text?: string }) {
  return <div className="flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm text-muted shadow-[0_6px_16px_rgb(6_23_47/0.04)]"><Search className="size-4" />{text}</div>;
}

function QuietLabel({ children, tone = "slate" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold ${TONE[tone]}`}>{children}</span>;
}

function Inbox() {
  const threads = [
    { name: "Fan 1842", text: "that sounds perfect honestly", time: "Now", badge: "VIP", tone: "gold" as Tone, active: true },
    { name: "Fan 0931", text: "Just unlocked it ✨", time: "2m", badge: "New", tone: "blue" as Tone },
    { name: "Fan 7250", text: "can I see another one?", time: "7m", badge: "", tone: "pink" as Tone },
    { name: "Fan 4108", text: "I’ll be back tonight", time: "18m", badge: "Quiet", tone: "slate" as Tone },
    { name: "Fan 6617", text: "sent a voice message", time: "35m", badge: "", tone: "green" as Tone },
  ];
  return (
    <>
      <PageHeader title="Inbox" detail="One place for every creator conversation, with the people who need attention first." action="New message" />
      <CrmTabs view="inbox" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Needs a reply" value="14" note="across 6 creators" tone="pink" icon={BellRing} />
        <Metric label="Priority fans" value="8" note="VIP or ready to buy" tone="gold" icon={Flame} />
        <Metric label="Manual takeover" value="3" note="AI paused" tone="blue" icon={UserRound} />
        <Metric label="Reply time" value="2m 14s" note="team average" tone="green" icon={Clock3} />
      </div>
      <Card className="overflow-hidden rounded-2xl border border-line/80 bg-white py-0">
        <div className="grid min-h-[640px] xl:grid-cols-[minmax(220px,0.9fr)_minmax(360px,1.45fr)_minmax(230px,0.85fr)]">
          <section className="border-b border-line xl:border-b-0 xl:border-r">
            <div className="border-b border-line p-4"><QuickSearch text="Search inbox" /></div>
            <div className="flex gap-2 overflow-x-auto border-b border-line px-4 py-3"><QuietLabel tone="navy">All 28</QuietLabel><QuietLabel>Unread 14</QuietLabel><QuietLabel tone="gold">VIP 8</QuietLabel></div>
            <div className="divide-y divide-line/80">
              {threads.map((thread) => (
                <div key={thread.name} className={`flex gap-3 px-4 py-3.5 ${thread.active ? "border-l-[3px] border-accent bg-[#edf6fb] pl-[13px]" : ""}`}>
                  <div className="relative"><Avatar name={thread.name} tone={thread.tone} /><span className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white bg-good p-1" /></div>
                  <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-ink">{thread.name}</span><span className="text-[11px] text-muted">{thread.time}</span></div><p className="mt-0.5 truncate text-xs text-muted">{thread.text}</p>{thread.badge ? <div className="mt-1.5"><QuietLabel tone={thread.tone}>{thread.badge}</QuietLabel></div> : null}</div>
                </div>
              ))}
            </div>
          </section>
          <section className="flex min-h-[420px] flex-col border-b border-line xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between border-b border-line px-5 py-4"><div className="flex items-center gap-3"><Avatar name="Fan 1842" tone="gold" /><div><div className="font-semibold text-ink">Fan 1842 <QuietLabel tone="gold">VIP</QuietLabel></div><div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"><Dot /> Active now · True Kait</div></div></div><MoreHorizontal className="size-5 text-muted" /></div>
            <div className="flex-1 space-y-4 bg-[#f6fafc] p-5">
              <div className="max-w-[82%] rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm leading-6 text-ink shadow-sm">you’re so sweet for saying that. i saved something just for later tonight 🤍<div className="mt-1 text-[10px] text-muted">8:42 PM</div></div>
              <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-md bg-accent px-4 py-3 text-sm leading-6 text-white">that sounds perfect honestly<div className="mt-1 text-[10px] text-white/60">8:43 PM · Read</div></div>
              <div className="max-w-[82%] rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm leading-6 text-ink shadow-sm">okay then, tell me what kind of mood you’re in and i’ll pick the right one ✨<div className="mt-1 text-[10px] text-muted">8:43 PM</div></div>
              <div className="mx-auto w-fit rounded-full bg-elev px-3 py-1 text-[11px] font-medium text-muted">AI has a reply ready</div>
            </div>
            <div className="border-t border-line p-4"><div className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-muted"><Sparkles className="size-4 text-love" /><span className="min-w-0 flex-1">Write a reply…</span><span className="grid size-7 place-items-center rounded-lg bg-accent text-white"><Send className="size-3.5" /></span></div></div>
          </section>
          <aside className="bg-white p-5">
            <div className="flex items-center gap-3"><Avatar name="Fan 1842" tone="gold" size="lg" /><div><div className="font-semibold text-ink">Fan 1842</div><div className="text-xs text-muted">Joined 28 Jul</div></div></div>
            <div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-xl bg-[#e4f7f1] p-3"><div className="text-[11px] font-medium text-good">Lifetime spend</div><div className="mt-1 text-lg font-semibold text-good">$412</div></div><div className="rounded-xl bg-[#fff7dc] p-3"><div className="text-[11px] font-medium text-[#966b05]">Purchases</div><div className="mt-1 text-lg font-semibold text-[#966b05]">12</div></div></div>
            <div className="mt-6"><div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Tags</div><div className="mt-2 flex flex-wrap gap-1.5"><QuietLabel tone="gold">Whale</QuietLabel><QuietLabel tone="pink">Video buyer</QuietLabel><QuietLabel tone="blue">Late night</QuietLabel></div></div>
            <div className="mt-6"><div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Next best action</div><div className="mt-2 rounded-xl border border-[#b9daf1] bg-[#edf6fb] p-3 text-sm leading-5 text-[#176596]"><Sparkles className="mr-1 inline size-4" />Send the saved late-night video offer after the current conversation.</div></div>
          </aside>
        </div>
      </Card>
    </>
  );
}

function Fans() {
  const fans = [
    ["Fan 1842", "Whale", "$412", "Active now", "gold"],
    ["Fan 0931", "New buyer", "$48", "2m ago", "blue"],
    ["Fan 7250", "Video buyer", "$91", "7m ago", "pink"],
    ["Fan 4108", "At risk", "$188", "4d ago", "slate"],
    ["Fan 6617", "First week", "$0", "35m ago", "green"],
  ] as const;
  return (
    <>
      <PageHeader title="Fan CRM" detail="Know who each fan is, what they value, and what should happen next." action="Add fan" />
      <CrmTabs view="fans" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total fans" value="2,438" note="across all creators" tone="navy" icon={UsersRound} /><Metric label="Paying customers" value="641" note="26.3% of fans" tone="green" icon={CircleDollarSign} /><Metric label="At risk" value="94" note="buyers quiet 7+ days" tone="pink" icon={BellRing} /><Metric label="Whales" value="18" note="spent more than $250" tone="gold" icon={Flame} /></div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="gap-0 overflow-hidden rounded-2xl py-0"><CardHeader className="border-b border-line py-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Fans</CardTitle><CardDescription>Saved views make the right group one tap away.</CardDescription></div><div className="w-full sm:w-64"><QuickSearch /></div></div></CardHeader><CardContent className="px-0"><div className="flex gap-2 overflow-x-auto border-b border-line px-4 py-3"><QuietLabel tone="navy">All fans</QuietLabel><QuietLabel tone="gold">Whales</QuietLabel><QuietLabel tone="pink">At risk</QuietLabel><QuietLabel tone="blue">New this week</QuietLabel><QuietLabel>Never bought</QuietLabel></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#f6fafc] text-xs text-muted"><tr><th className="px-5 py-3 font-medium">Fan</th><th className="px-4 py-3 font-medium">Segment</th><th className="px-4 py-3 font-medium">Lifetime spend</th><th className="px-4 py-3 font-medium">Last activity</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-line/80">{fans.map(([name, segment, spend, activity, tone]) => <tr key={name} className="hover:bg-[#f6fafc]"><td className="px-5 py-3.5"><div className="flex items-center gap-3"><Avatar name={name} tone={tone as Tone} /><div><div className="font-semibold text-ink">{name}</div><div className="text-xs text-muted">True Kait</div></div></div></td><td className="px-4 py-3.5"><QuietLabel tone={tone as Tone}>{segment}</QuietLabel></td><td className="px-4 py-3.5 font-semibold text-good">{spend}</td><td className="px-4 py-3.5 text-muted">{activity}</td><td className="px-5 py-3.5 text-right"><ArrowUpRight className="ml-auto size-4 text-muted" /></td></tr>)}</tbody></table></div></CardContent></Card>
        <Card className="rounded-2xl"><CardHeader><div className="flex items-center gap-2"><div className="grid size-8 place-items-center rounded-xl bg-[#fff7dc] text-[#966b05]"><Flame className="size-4" /></div><div><CardTitle>Smart segments</CardTitle><CardDescription>Groups that stay current by themselves.</CardDescription></div></div></CardHeader><CardContent className="space-y-3">{[["VIP buyers", "18 fans", "gold"], ["Quiet customers", "94 fans", "pink"], ["New fans", "126 fans", "blue"], ["Ready for first offer", "211 fans", "green"]].map(([label, count, tone]) => <div key={label} className="flex items-center justify-between rounded-xl border border-line bg-[#fbfdfe] p-3"><div className="flex items-center gap-3"><span className={`grid size-8 place-items-center rounded-lg ${TONE[tone as Tone]}`}><Layers3 className="size-4" /></span><div><div className="text-sm font-semibold text-ink">{label}</div><div className="text-xs text-muted">{count}</div></div></div><ArrowUpRight className="size-4 text-muted" /></div>)}</CardContent></Card>
      </div>
    </>
  );
}

function Campaigns() {
  const campaigns = [
    { title: "Late-night video offer", audience: "VIP buyers · 18 fans", delivery: "Tonight · 9:30 PM", status: "Scheduled", tone: "blue" as Tone, rate: "—" },
    { title: "Welcome back", audience: "Quiet customers · 94 fans", delivery: "Running now", status: "Live", tone: "green" as Tone, rate: "18.6%" },
    { title: "First purchase nudge", audience: "Ready for first offer · 211 fans", delivery: "Draft", status: "Draft", tone: "slate" as Tone, rate: "—" },
  ];
  return <><PageHeader title="Campaigns" detail="Build a message once, send it to the right audience, and see what it earned." action="Create campaign" /><CrmTabs view="campaigns" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active campaigns" value="3" note="across all creators" tone="blue" icon={PlayCircle} /><Metric label="Messages delivered" value="1,284" note="last 30 days" tone="navy" icon={Send} /><Metric label="Campaign revenue" value="$2,834" note="last 30 days" tone="green" icon={TrendingUp} /><Metric label="Best conversion" value="18.6%" note="welcome back flow" tone="pink" icon={Zap} /></div><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"><div className="space-y-3">{campaigns.map((campaign) => <Card key={campaign.title} className="rounded-2xl"><CardContent className="flex flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 gap-3"><div className={`grid size-11 shrink-0 place-items-center rounded-xl ${TONE[campaign.tone]}`}><Send className="size-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-heading text-base font-semibold text-ink">{campaign.title}</h2><QuietLabel tone={campaign.tone}>{campaign.status}</QuietLabel></div><p className="mt-1 text-sm text-muted">{campaign.audience} · {campaign.delivery}</p></div></div><div className="grid grid-cols-2 gap-5 border-t border-line pt-3 text-right sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0"><div><div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Conversion</div><div className="mt-1 font-semibold text-ink">{campaign.rate}</div></div><div><div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Revenue</div><div className="mt-1 font-semibold text-good">$684</div></div></div></CardContent></Card>)}</div><Card className="rounded-2xl"><CardHeader><div className="flex items-center gap-2"><div className="grid size-8 place-items-center rounded-xl bg-[#fff0f7] text-love-ink"><Sparkles className="size-4" /></div><div><CardTitle>Audience first</CardTitle><CardDescription>Start with the people, then choose the message.</CardDescription></div></div></CardHeader><CardContent className="space-y-3"><div className="rounded-xl border border-[#b9daf1] bg-[#edf6fb] p-4"><div className="text-sm font-semibold text-[#176596]">Quiet customers</div><p className="mt-1 text-xs leading-5 text-[#176596]">94 paying fans who have not chatted in seven days.</p><div className="mt-3 flex items-center justify-between"><QuietLabel tone="blue">94 fans</QuietLabel><span className="text-xs font-semibold text-[#176596]">Build campaign →</span></div></div><div className="rounded-xl border border-line bg-[#fbfdfe] p-4"><div className="text-sm font-semibold text-ink">Your saved segments</div><div className="mt-3 space-y-2 text-sm text-muted"><div className="flex justify-between"><span>VIP buyers</span><span>18</span></div><div className="flex justify-between"><span>New fans</span><span>126</span></div><div className="flex justify-between"><span>Never bought</span><span>1,797</span></div></div></div></CardContent></Card></div></>;
}

function Team() {
  const people = [{ name: "Jesse M.", role: "Owner", state: "Online", tone: "navy" as Tone, count: "8 conversations" }, { name: "Riley P.", role: "Team lead", state: "Online", tone: "blue" as Tone, count: "14 conversations" }, { name: "Mia S.", role: "Support", state: "Away", tone: "pink" as Tone, count: "6 conversations" }, { name: "Taylor R.", role: "Support", state: "Offline", tone: "slate" as Tone, count: "—" }];
  return <><PageHeader title="Team" detail="Give each person a clear role, a clear queue, and a clear view of their work." action="Invite teammate" /><CrmTabs view="team" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Team members" value="8" note="5 online now" tone="navy" icon={UsersRound} /><Metric label="Open conversations" value="28" note="14 need a reply" tone="pink" icon={MessageCircle} /><Metric label="Quality score" value="96%" note="last 7 days" tone="green" icon={BadgeCheck} /><Metric label="Coverage" value="18h" note="today" tone="blue" icon={CalendarClock} /></div><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"><Card className="rounded-2xl"><CardHeader><div className="flex items-center justify-between"><div><CardTitle>Today’s team</CardTitle><CardDescription>Who is working, and what is on their desk.</CardDescription></div><QuietLabel tone="green"><Dot /> 5 online</QuietLabel></div></CardHeader><CardContent className="space-y-3">{people.map((person) => <div key={person.name} className="flex flex-col gap-3 rounded-xl border border-line bg-[#fbfdfe] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="relative"><Avatar name={person.name} tone={person.tone} /><span className={`absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white p-1 ${person.state === "Online" ? "bg-good" : person.state === "Away" ? "bg-[#d69a08]" : "bg-muted"}`} /></div><div><div className="font-semibold text-ink">{person.name}</div><div className="text-xs text-muted">{person.role}</div></div></div><div className="flex items-center justify-between gap-5 sm:text-right"><div><QuietLabel tone={person.state === "Online" ? "green" : person.state === "Away" ? "gold" : "slate"}>{person.state}</QuietLabel><div className="mt-1 text-xs text-muted">{person.count}</div></div><ArrowUpRight className="size-4 text-muted" /></div></div>)}</CardContent></Card><Card className="rounded-2xl"><CardHeader><CardTitle>Team controls</CardTitle><CardDescription>Keep every account safe and every responsibility clear.</CardDescription></CardHeader><CardContent className="space-y-3">{[[ShieldCheck, "Roles & permissions", "Choose what each teammate can see and change.", "green"], [CalendarClock, "Shifts", "Plan coverage across creators and time zones.", "blue"], [BadgeCheck, "Quality review", "Review chats and save coaching notes.", "pink"]].map(([Icon, title, body, tone]) => { const IconComponent = Icon as LucideIcon; return <div key={title as string} className="rounded-xl border border-line p-3"><div className="flex gap-3"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${TONE[tone as Tone]}`}><IconComponent className="size-4" /></span><div><div className="text-sm font-semibold text-ink">{title as string}</div><p className="mt-0.5 text-xs leading-5 text-muted">{body as string}</p></div></div></div>})}</CardContent></Card></div></>;
}

function Platforms() {
  const platforms = [{ name: "OnlyFans", initials: "OF", tone: "navy" as Tone, detail: "Creator accounts, inboxes and performance in one workspace.", features: ["Accounts", "Inbox", "Revenue"] }, { name: "Fanvue", initials: "FV", tone: "blue" as Tone, detail: "A unified view across creators without changing the way your team works.", features: ["Accounts", "Fans", "Campaigns"] }, { name: "Fansly", initials: "FY", tone: "pink" as Tone, detail: "Connect accounts, manage fans and compare performance alongside the rest.", features: ["Accounts", "Fans", "Reports"] }];
  return <><PageHeader title="Platforms" detail="Bring every creator account into one clean operating workspace." action="Link account" /><CrmTabs view="platforms" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Creator accounts" value="14" note="across connected platforms" tone="navy" icon={Layers3} /><Metric label="Platforms" value="3" note="one shared workspace" tone="blue" icon={Zap} /><Metric label="Active sessions" value="8" note="team members online" tone="green" icon={CheckCircle2} /><Metric label="Account health" value="100%" note="all accounts monitored" tone="pink" icon={ShieldCheck} /></div><div className="grid gap-4 lg:grid-cols-3">{platforms.map((platform) => <Card key={platform.name} className="rounded-2xl"><CardHeader><div className="flex items-start justify-between"><span className={`grid size-12 place-items-center rounded-2xl text-sm font-bold ${TONE[platform.tone]}`}>{platform.initials}</span><QuietLabel tone="green"><Dot /> Ready</QuietLabel></div><CardTitle className="mt-4 text-xl">{platform.name}</CardTitle><CardDescription className="leading-6">{platform.detail}</CardDescription></CardHeader><CardContent><div className="flex flex-wrap gap-1.5">{platform.features.map((feature) => <QuietLabel key={feature}>{feature}</QuietLabel>)}</div><div className="mt-5 flex items-center justify-between rounded-xl border border-line bg-[#fbfdfe] p-3"><div><div className="text-sm font-semibold text-ink">Creator account hub</div><div className="text-xs text-muted">View accounts and permissions</div></div><ArrowUpRight className="size-4 text-muted" /></div></CardContent></Card>)}</div><Card className="rounded-2xl border border-[#b9daf1] bg-[#edf6fb]"><CardContent className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[#176596]"><ShieldCheck className="size-5" /></span><div><div className="font-heading text-base font-semibold text-[#06172f]">One team. One permission model.</div><p className="mt-1 max-w-2xl text-sm leading-6 text-[#176596]">The platform hub keeps creator access, roles, account health and activity visible in the same place.</p></div></div><div className="shrink-0 text-sm font-semibold text-[#176596]">Manage access →</div></CardContent></Card></>;
}

export default function CrmPreview({ view }: { view: CrmPreviewView }) {
  const page = { inbox: <Inbox />, fans: <Fans />, campaigns: <Campaigns />, team: <Team />, platforms: <Platforms /> }[view];
  return <div className="dashboard-page space-y-5 pb-8">{page}</div>;
}

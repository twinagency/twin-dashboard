import Link from "next/link";

const TABS: [string, string, string][] = [
  ["overview", "/tsocial", "Overview"],
  ["earnings", "/tsocial/earnings", "Earnings"],
  ["bot-sends", "/tsocial/bot-sends", "Bot sends"],
];

// Plain server component: the three T-Social admin pages share one tab strip.
export default function TSocialTabs({ active }: { active: "overview" | "earnings" | "bot-sends" }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="mr-3 text-3xl font-bold text-ink">T-Social</h1>
      {TABS.map(([key, href, label]) => (
        <Link key={key} href={href} aria-current={key === active ? "page" : undefined}
          className={"rounded-full border px-4 py-1.5 text-sm font-semibold transition " + (key === active ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:text-ink")}>
          {label}
        </Link>
      ))}
    </div>
  );
}

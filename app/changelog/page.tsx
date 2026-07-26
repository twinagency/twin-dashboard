import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Simple "what's new" list. Not a CMS - just a hand-maintained array, add an
// entry here each time something operator-facing ships. Grouped by date,
// newest first.
type Entry = { title: string; body: string };
type Release = { date: string; label: string; entries: Entry[] };

const RELEASES: Release[] = [
  {
    date: "2026-07-27",
    label: "July 27",
    entries: [
      {
        title: "Configure re-sorted into Identity / Config / Monetization / Advanced",
        body: "The single long settings page is now four tabs grouped by what they actually control, with identity canon fields (stage name, appearance, voice, daily rhythm) given their own typed home instead of living in prose.",
      },
      {
        title: "Discount caps default to something that actually works",
        body: "Every per-type discount cap column defaulted to 0, so discounts the AI picked never fired. Fresh clones now start with working caps out of the box.",
      },
      {
        title: "Imperfection profile as an intensity scale",
        body: "Lowercase / dropped punctuation / typos / double-texting move from flat on-off switches to a never - sometimes - often - always dial per trait.",
      },
      {
        title: "Response pacing controls",
        body: "Read delay, typing stutter, and per-message-count ramping are now dashboard-configurable instead of a single flat wait, so a fresh clone can read as more human without code changes.",
      },
      {
        title: "Photo vision toggle",
        body: "Whether she actually looks at photos a fan sends is now an operator toggle, matching the existing video vision toggle instead of being hardcoded on.",
      },
      {
        title: "Identity canon: typed facts instead of prose",
        body: "Stage name, real name, appearance, career story, and relationship policy became typed columns injected deterministically, so the AI compiler can no longer drop or mutate a fact a fan can directly ask about.",
      },
      {
        title: "Reply length controls",
        body: "A hard word-count ceiling per clone, plus an option to scale her reply length to match how long the fan's message was.",
      },
    ],
  },
  {
    date: "2026-07-26",
    label: "July 26",
    entries: [
      { title: "Sidebar redesign", body: "One flat nav list instead of a split layout." },
      { title: "Secret fields blur by default", body: "Bot tokens and API keys stay masked until you choose to reveal them." },
      { title: "Blur-media toggle", body: "Preview thumbnails can be blurred fleet-wide from the header." },
      { title: "Onboarding UI pass", body: "The new-clone questionnaire got a visual cleanup." },
      { title: "Em dash sweep", body: "Removed em dashes across every page's copy, hints, and labels." },
      { title: "Internal AI data assistant", body: "A read-only /ai page that can answer questions against an explicit table/column allowlist." },
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-2xl text-ink">
      <h1 className="mb-1 text-2xl font-semibold">What's new</h1>
      <p className="mb-6 text-sm text-muted">Recent operator-facing changes, newest first.</p>

      <div className="space-y-8">
        {RELEASES.map((r) => (
          <div key={r.date}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{r.label}</h2>
            <div className="space-y-2">
              {r.entries.map((e) => (
                <Card key={e.title} className="p-4">
                  <div className="text-sm font-medium">{e.title}</div>
                  <div className="mt-1 text-sm text-muted">{e.body}</div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

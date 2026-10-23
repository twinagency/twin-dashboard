import Link from "@/components/NavigationLink";

export default function LaunchLayout({ children }: { children: React.ReactNode }) {
  return <div className="dashboard-page min-w-0">
    <nav aria-label="OnlyFans launch navigation" className="mb-4 flex flex-wrap gap-2">
      {[["/onlyfans/launch", "Launch readiness"], ["/onlyfans/launch/memory", "Fan memory"],
        ["/onlyfans/launch/automation", "Automation"], ["/onlyfans/inbox", "Inbox"]].map(([href, label]) =>
        <Link key={href} href={href} className="rounded-lg border border-line px-3 py-2 text-sm text-accent">{label}</Link>)}
    </nav>
    {children}
  </div>;
}

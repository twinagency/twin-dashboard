"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/mtproto-campaign", label: "Overview", match: (p: string) => p === "/mtproto-campaign" || p.startsWith("/mtproto-campaign/runs") },
  { href: "/mtproto-campaign/connections", label: "Connections", match: (p: string) => p.startsWith("/mtproto-campaign/connections") },
  { href: "/mtproto-campaign/new", label: "New run", match: (p: string) => p.startsWith("/mtproto-campaign/new") },
];

// Three-tab strip at the top of every MTProto Campaign screen.
export default function MtprotoNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="MTProto Campaign" className="flex gap-1 overflow-x-auto rounded-full border border-line bg-panel p-1 shadow-[var(--shadow-card)]">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${active ? "bg-accent text-accent-ink" : "text-muted hover:bg-muted/10 hover:text-ink"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

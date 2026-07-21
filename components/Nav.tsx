"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Revenue", match: (p: string) => p === "/" },
  { href: "/clones", label: "Clones", match: (p: string) => p.startsWith("/clones") },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-2 text-sm">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              "rounded-md border px-3 py-1.5 font-medium transition " +
              (active
                ? "border-ink bg-ink text-white"
                : "border-line text-muted hover:bg-muted/10")
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

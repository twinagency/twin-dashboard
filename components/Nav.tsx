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
                ? "border-gray-900 bg-gray-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-900")
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

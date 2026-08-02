"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Mobile-only hamburger — mirrors the desktop Sidebar's global links (each page
// type once). Clone scoping is handled by the CloneSwitcher bar in layout.tsx,
// which renders on every breakpoint, so this menu doesn't need its own clone
// picker or per-clone section links anymore.
const LINKS: { label: string; href: string }[] = [
  { label: "Revenue", href: "/revenue" },
  { label: "Fans", href: "/users" },
  { label: "AI", href: "/jarvis" },
  { label: "Info", href: "/info" },
  { label: "Flows", href: "/flows" },
  { label: "Media", href: "/media" },
  { label: "Logs", href: "/logs" },
];

export default function MobileMenu({ clones }: { clones: { id: string; name: string }[] }) {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const itemCls = (active: boolean) =>
    "w-full rounded-lg px-3 py-2.5 text-sm font-medium " +
    (active ? "bg-accent/10 text-accent" : "text-muted");

  return (
    <div className="lg:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Menu"
              className="rounded-lg p-2 text-muted transition hover:bg-muted/10 hover:text-ink"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
          }
        />
        <DropdownMenuContent align="end" className="max-h-[80vh] w-64 overflow-auto p-1.5">
          {LINKS.map((l) => (
            <DropdownMenuItem key={l.href} className={itemCls(isActive(l.href))} render={<Link href={l.href} />}>
              {l.label}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem className={itemCls(isActive("/clones"))} render={<Link href="/clones" />}>
            Clones (manage)
          </DropdownMenuItem>
          <DropdownMenuItem className={itemCls(isActive("/clones/new"))} render={<Link href="/clones/new" />}>
            + Create new clone
          </DropdownMenuItem>
          <DropdownMenuItem className={itemCls(isActive("/settings"))} render={<Link href="/settings" />}>
            Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

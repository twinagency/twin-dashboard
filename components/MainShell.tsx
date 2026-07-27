"use client";

import { usePathname } from "next/navigation";

// The scrollable content area under the TopBar. CLIENT component for the same
// reason TopBar is: which page is showing decides its width/padding (the Fans
// inbox runs edge-to-edge full-bleed, everything else is a centered reading
// column), and the root layout this mounts in does NOT re-render on
// client-side navigation — a server-side x-pathname check froze the layout
// mode on whatever page you first loaded, so switching Revenue→Fans kept the
// narrow column (squashed inbox) and Fans→Revenue leaked full-bleed. This is
// the bug behind "pages break when switching between them".
export default function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = pathname === "/users";
  return (
    <main
      className={
        fullBleed
          ? "min-h-0 flex-1 overflow-y-auto canvas-glow"
          : "mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-y-auto p-4 canvas-glow"
      }
    >
      {children}
    </main>
  );
}

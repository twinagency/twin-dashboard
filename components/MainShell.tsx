"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { isBriannaStudioRoute } from "@/lib/dashboard-creator-route";
import TwinAssistant from "@/components/TwinAssistant";
import { useDashboardAccess } from "./DashboardAccessProvider";

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
  const {isAgency, isCreator} = useDashboardAccess();
  const searchParams = useSearchParams();
  const studioDashboard = !isAgency && !isCreator && (pathname === "/dashboard" || isBriannaStudioRoute(pathname, searchParams.get("tab"), searchParams.get("sub")));
  const fullBleed = pathname === "/users" || pathname === "/inbox" || pathname === "/jarvis" || pathname === "/fans";
  return (
    <main
      className={
        studioDashboard ? "dashboard-main creator-studio-main min-h-0 w-full flex-1 overflow-y-auto" : fullBleed
          ? "dashboard-main min-h-0 flex-1 overflow-y-auto pb-28 canvas-glow lg:pb-0"
          : "dashboard-main mx-auto min-h-0 w-full max-w-[1480px] flex-1 overflow-y-auto p-4 pb-32 sm:p-6 sm:pb-32 lg:p-8 canvas-glow"
      }
    >
      {children}
      {!isAgency && !isCreator && pathname !== "/jarvis" && pathname !== "/fans" && !studioDashboard ? <TwinAssistant variant="mobile-dock" /> : null}
    </main>
  );
}



// The sign-out control's markup, on its own.
//
// It exists as a separate module so the live form and the isolated preview can
// render the *identical* control while only one of them is wired to anything.
// A preview that reached the real sign-out would clear a real session from a
// fixture surface, so the preview renders this button in `simulated` mode:
// disabled, labelled as simulated, and unable to submit.
//
// This file deliberately imports no server action. The form that carries the
// action lives with its caller (components/TopBar.tsx for the dashboard), which
// keeps the live action out of the preview's module graph entirely — the
// preview's own import audit asserts exactly which server actions it can reach.

import type { ReactNode } from "react";

export default function SignOutButton({
  mode = "live",
  showLabel = false,
}: {
  mode?: "live" | "simulated";
  showLabel?: boolean;
}): ReactNode {
  const simulated = mode === "simulated";
  return (
    <button
      type="submit"
      data-of-signout={simulated ? "simulated" : "live"}
      disabled={simulated || undefined}
      aria-disabled={simulated || undefined}
      title={simulated ? "Sign out (simulated: the preview does not sign out)" : "Sign out"}
      aria-label={simulated ? "Sign out (simulated)" : "Sign out"}
      className="flex items-center justify-center gap-1.5 rounded-full p-2 text-muted transition hover:bg-muted/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {showLabel && <span className="hidden text-xs font-medium sm:inline">Sign out</span>}
    </button>
  );
}

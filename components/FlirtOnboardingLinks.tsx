import Link from "next/link";

/**
 * FLIRT-only navigation. Neither link submits anything: onboarding stays a draft
 * until the creator chooses to finish it, and every step is optional.
 */
export function SkipToDashboard() {
  return (
    <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between" data-onboarding-skip-section>
      <p className="text-sm text-muted">Nothing here is required. Skip for now and finish onboarding later from your dashboard.</p>
      {/* Plain anchor to /creator: a GET that never posts to the onboarding route. */}
      <a href="/creator" className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-lg bg-[#dc2626] px-5 py-2 text-sm font-semibold text-white hover:bg-[#b91c1c] sm:w-auto" data-onboarding-skip-to-dashboard data-onboarding-skip-all>Skip to dashboard</a>
    </div>
  );
}

/** Dashboard banner. "Finish" while nothing is submitted, "Return" once it is. */
export function OnboardingBanner({ finished }: { finished: boolean }) {
  return (
    <section className="mb-5 flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Creator onboarding">
      <div>
        <p className="font-semibold text-ink">Your onboarding</p>
        <p className="mt-1 text-sm text-muted">{finished ? "Update your answers or add more photos and videos at any time." : "You skipped onboarding for now. Add your answers, photos and videos whenever you're ready."}</p>
      </div>
      <Link href="/creator/onboarding" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-[#dc2626] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b91c1c]" data-return-to-onboarding {...(finished ? {} : { "data-finish-onboarding": "" })}>{finished ? "Return to onboarding" : "Finish onboarding"}</Link>
    </section>
  );
}

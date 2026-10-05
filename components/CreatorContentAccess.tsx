import Link from "next/link";

/** Saved uploads belong to the creator account, before AI profile connection. */
export default function CreatorContentAccess() {
  return (
    <section aria-label="Your saved content and onboarding" className="mb-5 rounded-xl border border-line bg-panel p-4">
      <h2 className="font-semibold text-ink">Your content and onboarding</h2>
      <p className="mt-1 text-sm text-muted">Review your saved uploads or return to your onboarding details. Your AI profile does not need to be connected.</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <Link href="/creator/onboarding?step=content" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white" data-creator-content-access>My uploaded content</Link>
        <Link href="/creator/onboarding" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink" data-creator-onboarding-access>Onboarding details</Link>
      </div>
    </section>
  );
}

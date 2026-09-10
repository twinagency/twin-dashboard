"use client";
export default function CreatorPageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="rounded-2xl border border-line bg-panel p-6"><h2 className="text-lg font-semibold text-ink">This page could not be loaded</h2><p className="mt-2 text-sm text-muted">Your account and saved information have not been changed. Try loading the page again.</p><button type="button" onClick={reset} className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Try again</button></section>;
}

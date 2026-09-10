"use client";
export default function CreatorError({ reset }: { error: Error; reset: () => void }) {
  return <div role="alert" className="m-5 rounded-xl border border-line bg-panel p-6"><h2 className="text-xl font-semibold">This creator page could not load.</h2><p className="mt-2 text-sm text-muted">Your account and saved information have not been changed.</p><button type="button" onClick={reset} className="mt-5 rounded-lg bg-accent px-4 py-2 font-medium text-white">Try again</button></div>;
}

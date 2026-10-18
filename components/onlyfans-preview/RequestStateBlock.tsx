// Rendering for the five request states.
//
// Empty, unavailable, loading, error and stale are five different situations
// and a dashboard that renders them as one is how an outage reads as "no
// conversations". Each branch is labelled, and none of them ever shows a zero
// where the truth is "unknown".

import type { ReactNode } from "react";
import type { Freshness, RequestState } from "@/lib/onlyfans-preview/types";
import { formatAge } from "@/lib/onlyfans-preview/fixtures";

type Copy = {
  title: string;
  detail: string;
};

export function StateCard({
  tone,
  title,
  detail,
  children,
}: {
  tone: "neutral" | "warn" | "crit";
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  const border =
    tone === "crit" ? "border-[#f0c3cb]" : tone === "warn" ? "border-[#f0d9a8]" : "border-line";
  const bg = tone === "crit" ? "bg-[#fff5f6]" : tone === "warn" ? "bg-[#fff8e8]" : "bg-[#fbfdfe]";
  return (
    <div data-of-state={tone} className={`rounded-xl border ${border} ${bg} p-4`}>
      <div className="text-sm font-semibold text-ink">{title}</div>
      <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
      {children}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div data-of-state="loading" className="space-y-2" aria-busy="true">
      <div className="h-4 w-40 animate-pulse rounded bg-elev" />
      <div className="h-3 w-full animate-pulse rounded bg-elev" />
      <div className="h-3 w-4/5 animate-pulse rounded bg-elev" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

const COPY: Record<"empty" | "error" | "unavailable", Copy> = {
  empty: {
    title: "Nothing here yet",
    detail:
      "Your accounts and conversations will appear here when they are available.",
  },
  unavailable: {
    title: "No OnlyFans backend is connected",
    detail:
      "OnlyFans is not available in this workspace yet. Ask your account administrator to finish setup.",
  },
  error: {
    title: "This view could not be loaded",
    detail:
      "We couldn’t refresh this view. Please try again in a moment.",
  },
};

/**
 * Renders a request state. `render` is called only for ready and stale data, so
 * a caller cannot accidentally read a field off an absent payload.
 */
export function RequestStateBlock<T>({
  state,
  label,
  render,
}: {
  state: RequestState<T>;
  label: string;
  render: (data: T, freshness: Freshness | null) => ReactNode;
}) {
  switch (state.status) {
    case "loading":
      return <LoadingState label={`Loading ${label}`} />;
    case "empty":
      return <StateCard tone="neutral" title={COPY.empty.title} detail={COPY.empty.detail} />;
    case "unavailable":
      return (
        <StateCard
          tone="warn"
          title={COPY.unavailable.title}
          detail={`${COPY.unavailable.detail} ${state.message}`}
        />
      );
    case "error":
      return (
        <StateCard tone="crit" title={COPY.error.title} detail={`${COPY.error.detail} ${state.message}`} />
      );
    case "stale":
      return (
        <div className="space-y-3">
          <StateCard
            tone="warn"
            title="Data may be outdated"
            detail={state.freshness.asOf ? `The last complete sync was ${formatAge(state.freshness.asOf)}. Newer activity may not appear here.` : "Synchronization is incomplete or has not been verified. Newer activity may be missing."}
          />
          <div className="opacity-90">{render(state.data, state.freshness)}</div>
        </div>
      );
    case "ready":
      return <>{render(state.data, null)}</>;
    default:
      return null;
  }
}

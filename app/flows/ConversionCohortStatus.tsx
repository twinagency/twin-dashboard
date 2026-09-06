import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { REPORT_TZ } from "@/lib/report-time";

type ConversionCohortStatusProps = {
  newSystemEnabled: boolean;
  enrolledAt: string | null | undefined;
  step1AfterMessages: number | null;
  step2AfterMessages: number | null;
  intentFallbackOfferAfterMessages: number | null | undefined;
  intentMaxIgnoredOffers: number | null | undefined;
};

// Mirrors bot/src/intent/state.ts's dial(): 0 is a deliberate off switch,
// while a missing, negative, or malformed value falls back to the shipped
// runtime default. Keeping that rule here makes "current timing" truthful.
export function effectiveConversionDial(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

export function formatEnrollmentDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const enrolledAt = new Date(value);
  if (Number.isNaN(enrolledAt.getTime())) return null;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: REPORT_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(enrolledAt);
}

function afterMessages(value: number | null): string {
  if (value === null) return "Not configured";
  return `After ${value} message${value === 1 ? "" : "s"}`;
}

function ignoredOfferCap(value: number): string {
  if (value === 0) return "No cap";
  return `After ${value} ignored offer${value === 1 ? "" : "s"}`;
}

export default function ConversionCohortStatus({
  newSystemEnabled,
  enrolledAt,
  step1AfterMessages,
  step2AfterMessages,
  intentFallbackOfferAfterMessages,
  intentMaxIgnoredOffers,
}: ConversionCohortStatusProps) {
  const enrollmentDateTime = newSystemEnabled ? formatEnrollmentDateTime(enrolledAt) : null;
  const fallbackAfterMessages = effectiveConversionDial(intentFallbackOfferAfterMessages, 8);
  const maxIgnoredOffers = effectiveConversionDial(intentMaxIgnoredOffers, 2);
  const timings = [
    { label: "Onboarding step 1", value: afterMessages(step1AfterMessages) },
    { label: "Onboarding step 2", value: afterMessages(step2AfterMessages) },
    {
      label: "Intent fallback",
      value: fallbackAfterMessages === 0 ? "Disabled" : afterMessages(fallbackAfterMessages),
    },
    { label: "Ignored-offer cap", value: ignoredOfferCap(maxIgnoredOffers) },
  ];

  return (
    <Card
      aria-label="Conversion cohort status"
      data-cohort={newSystemEnabled ? "new-system" : "control"}
      className="mx-auto mb-6 w-full max-w-5xl gap-4 border border-line p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Conversion system</h2>
            <Badge
              variant="outline"
              className={
                newSystemEnabled
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-line bg-elev text-muted"
              }
            >
              {newSystemEnabled ? "New System" : "Control"}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {newSystemEnabled
              ? "This creator is on the new conversion system."
              : "This creator is on the old system (control)."}{" "}
            The cohort assignment is read-only here.
          </p>
        </div>
        <div className="shrink-0 sm:text-right">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            Cohort record
          </div>
          <div className="mt-1 text-xs font-medium text-ink">
            {newSystemEnabled ? (
              enrollmentDateTime ? (
                <time dateTime={enrolledAt ?? undefined}>Enrolled {enrollmentDateTime}</time>
              ) : (
                "Enrollment date unavailable"
              )
            ) : (
              "Not enrolled"
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
          Current saved timing
        </div>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {timings.map((timing) => (
            <div key={timing.label} className="rounded-lg border border-line bg-bg px-3 py-2.5">
              <dt className="text-[11px] font-medium text-muted">{timing.label}</dt>
              <dd className="mt-1 font-mono text-sm font-semibold tabular-nums text-ink">{timing.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

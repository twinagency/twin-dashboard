import { REPORT_TZ } from "./report-time";

export const CLONE_COHORTS = ["new-system", "control"] as const;

export type CloneCohort = (typeof CLONE_COHORTS)[number];
export type CloneCohortFilter = "all" | CloneCohort;

const enrollmentDate = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: REPORT_TZ,
});

// The database flag is the authority for the rollout cohort. Only an explicit
// true is New System, so an older or incomplete row stays safely labelled as
// Control instead of being presented as enrolled in the experiment.
export function cloneCohortFromPromotionFlag(
  intentClassicPromotionsEnabled: boolean | null | undefined,
): CloneCohort {
  return intentClassicPromotionsEnabled === true ? "new-system" : "control";
}

export function cloneMatchesCohort(
  cohort: CloneCohort,
  filter: CloneCohortFilter,
): boolean {
  return filter === "all" || cohort === filter;
}

export function cloneCohortEnrollmentLabel(
  cohort: CloneCohort,
  enabledAt: string | null | undefined,
): string {
  // The flag remains authoritative. A stale timestamp on a Control row must
  // never make the dashboard imply that the clone is enrolled.
  if (cohort === "control") return "Not enrolled";

  if (!enabledAt) return "Enrollment date unavailable";
  const parsed = new Date(enabledAt);
  if (Number.isNaN(parsed.getTime())) return "Enrollment date unavailable";
  return `Enrolled ${enrollmentDate.format(parsed)}`;
}

import { REPORT_TZ } from "./report-time";

export const CLONE_COHORTS = ["new-system-v2", "new-system-v1", "control"] as const;

export type CloneCohort = (typeof CLONE_COHORTS)[number];
export type CloneCohortFilter = "all" | CloneCohort;

const enrollmentDate = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: REPORT_TZ,
});

// The database flag is the authority for the rollout cohort. Only an explicit
// true is a New System creator. Version 2 is also explicit: an enabled row with
// missing/old metadata is V1, never silently presented as the newer experiment.
export function cloneCohortFromPromotionFlag(
  intentClassicPromotionsEnabled: boolean | null | undefined,
  intentClassicPromotionVersion?: number | null,
): CloneCohort {
  if (intentClassicPromotionsEnabled !== true) return "control";
  return intentClassicPromotionVersion === 2 ? "new-system-v2" : "new-system-v1";
}

export function cloneCohortLabel(cohort: CloneCohort): string {
  if (cohort === "new-system-v2") return "New System V2";
  if (cohort === "new-system-v1") return "V1";
  return "Control";
}

export function cloneCohortIsEnabled(cohort: CloneCohort): boolean {
  return cohort !== "control";
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

import type { BuildOutcome } from "./flirt-clone-pipeline";

// Short, URL-safe result codes shown on the Review profile page.
export function outcomeResult(outcome: BuildOutcome): string {
  switch (outcome.kind) {
    case "disabled": return "build_off";
    case "built": return outcome.reused ? "built_existing" : "built";
    case "already_linked": return "build_linked";
    case "refused": return `build_${outcome.code}`;
    default: return "build_error";
  }
}

export const RESULT_MESSAGES: Record<string, string> = {
  reviewed: "Decision recorded.",
  saved: "Creator profile saved.",
  conflict: "This profile changed. Reload and try again.",
  build_off: "Decision recorded. Clone building is switched off.",
  built: "Clone created in Twin, paused. Follow the checklist below to finish it.",
  built_existing: "Clone already existed in Twin and is now linked. Follow the checklist below.",
  build_linked: "This creator already has a clone.",
  build_no_consent: "Not built: no signed consent on record. Get her consent first, then press Build clone.",
  build_not_approved: "Not built: approve the application first.",
  build_no_answers: "Not built: the questionnaire is empty.",
  build_no_name: "Not built: no name to build the clone with.",
  build_dob_missing: "Not built: date of birth is missing (needed to confirm she is 18+).",
  build_dob_invalid: "Not built: date of birth could not be read. Ask her to correct it.",
  build_under_age: "Not built: under 18.",
  build_unknown_creator: "Not built: creator not found.",
  build_error: "Clone build failed. Nothing was activated. Try again or check the logs.",
};

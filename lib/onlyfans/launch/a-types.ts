/** Browser wrapper over the native, purpose-separated launch contracts. */
import {
  hash,
  object,
  text,
  validReview,
  parseNativeReadiness,
  parseNativeLedger,
  parseNativePersonality,
  type PersonalityReview,
} from "./native";
import { parseLedger } from "./ledger-model";
export const LAUNCH_SCHEMA = "of-launch.v1";
export const LAUNCH_HEADER = "X-OnlyFans-Launch-Version";
export type Screen = "readiness" | "purchases" | "personality";
export const SCREENS: Screen[] = ["readiness", "purchases", "personality"];
export const SCREEN_LABELS: Record<Screen, string> = {
  readiness: "A. Readiness",
  purchases: "B. Purchases",
  personality: "C. Personality and AI",
};
export type Wiring = "connected" | "partial" | "backend-pending";
/** Update only after the actual combined dashboard/backend rehearsal succeeds. */
export const WIRING: Record<Screen, { wiring: Wiring; note: string }> = {
  readiness: {
    wiring: "connected",
    note: "Reads account prerequisites, coverage and runtime state. Each account must satisfy its current checks before activation.",
  },
  purchases: {
    wiring: "connected",
    note: "Reads canonical scan status and transaction evidence. A queued retry does not establish recovery completion.",
  },
  personality: {
    wiring: "connected",
    note: "History import, complete review, approval and audit use the current creator binding. AI settings and readiness remain separate from approval.",
  },
};
export {
  parseNativeReadiness as parseReadiness,
  parseNativeLedger as parsePurchaseEvidence,
  parseNativePersonality as parsePersonality,
};
export type {
  NativeReadiness as Readiness,
  NativeLedger as PurchaseEvidence,
  Personality as PersonalitySettings,
} from "./native";
export const PARSERS = {
  readiness: parseNativeReadiness,
  purchases: parseLedger,
  personality: parseNativePersonality,
} as const;
export const ID = /^[A-Za-z0-9._:-]{1,64}$/;
export type LaunchCommand =
  | {
      path: "ledger/retry";
      id: null;
      body: { expectedConnectionRevision: number; expectedScanFingerprint: string };
    }
  | {
      path: "ledger/resolve";
      id: null;
      body: {
        expectedFingerprint: string;
        reason: string;
        evidenceHash: string;
      };
    }
  | { path: "personality/import"; id: null; body: { expectedRevision: number; expectedBindingId: string } }
  | {
      path: "personality/review";
      id: null;
      body: { expectedRevision: number; expectedBindingId: string; review: PersonalityReview };
    }
  | {
      path: "personality/approve";
      id: null;
      body: {
        expectedRevision: number;
        expectedBindingId: string;
        acknowledgements: {
          mixedAuthorship: true;
          runtimeRules: true;
          factsVerified: true;
        };
      };
    };
const keys = (v: Record<string, unknown>, k: string[]) =>
  Object.keys(v).sort().join(",") === [...k].sort().join(",");
const revision = (v: unknown) =>
  Number.isInteger(v) && Number(v) >= 0 && Number(v) < 2 ** 31 - 1;
export function validCommand(c: unknown): c is LaunchCommand {
  if (
    !object(c) ||
    !keys(c, ["path", "id", "body"]) ||
    c.id !== null ||
    !object(c.body) ||
    !text(c.path, 64)
  )
    return false;
  const b = c.body;
  if (c.path === "ledger/retry") return revision(b.expectedConnectionRevision) && hash(b.expectedScanFingerprint) && keys(b, ["expectedConnectionRevision", "expectedScanFingerprint"]);
  if (c.path === "ledger/resolve")
    return (
      hash(b.expectedFingerprint) &&
      text(b.reason, 512) &&
      !!b.reason.trim() &&
      keys(
        b,
        ["expectedFingerprint", "reason", "evidenceHash"],
      ) &&
      hash(b.evidenceHash)
    );
  if (!revision(b.expectedRevision) || typeof b.expectedBindingId !== "string" || !ID.test(b.expectedBindingId)) return false;
  switch (c.path) {
    case "personality/import":
      return keys(b, ["expectedRevision", "expectedBindingId"]);
    case "personality/review":
      return keys(b, ["expectedRevision", "expectedBindingId", "review"]) && validReview(b.review);
    case "personality/approve":
      return (
        keys(b, ["expectedRevision", "expectedBindingId", "acknowledgements"]) &&
        object(b.acknowledgements) &&
        keys(b.acknowledgements, [
          "mixedAuthorship",
          "runtimeRules",
          "factsVerified",
        ]) &&
        Object.values(b.acknowledgements).every((x) => x === true)
      );
    default:
      return false;
  }
}
export const READ_PATHS: Record<Screen, string> = {
  readiness: "readiness",
  purchases: "purchases",
  personality: "personality",
};

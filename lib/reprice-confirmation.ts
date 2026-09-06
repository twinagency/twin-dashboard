import { createHash } from "node:crypto";
import type { CategoryPricing, SafeRepriceChange } from "./pricing";

export type RepriceConfirmationTarget = "photos" | "videos" | "all";

type RepriceConfirmationInput = {
  cloneId: string;
  target: RepriceConfirmationTarget;
  guide: CategoryPricing;
  changes: Record<"photos" | "videos", SafeRepriceChange[]>;
};

// Confirmation is bound to the exact commercial change the operator previewed,
// not just to a row count. A guide edit, price edit, different creator, changed
// item id or different proposed price produces a new phrase and forces a fresh
// preview before any write can begin.
export function repriceConfirmationPhrase(input: RepriceConfirmationInput): string {
  const guide = Object.fromEntries(
    Object.entries(input.guide).sort(([left], [right]) => left.localeCompare(right)),
  );
  const changes = (["photos", "videos"] as const).flatMap((table) =>
    input.changes[table]
      .map((change) => ({ table, ...change }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
  const digest = createHash("sha256")
    .update(JSON.stringify({ cloneId: input.cloneId, target: input.target, guide, changes }))
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
  return `REPRICE ${changes.length} ${input.target.toUpperCase()} ${digest}`;
}

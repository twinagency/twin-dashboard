/**
 * RETIRED. The visual_description backfill (one column, no backup, could overwrite a manual fix) is replaced by
 * scripts/repair-media-analysis.ts, which re-analyses a row into the whole factual set (description, tags, flags, facts, status),
 * keeps a backup, never touches manually edited rows, copies results onto bundle items and can roll back.
 *
 * This wrapper only forwards the read-only dry run (as `inventory`); anything that wrote now needs the new script's
 * `preview` then `apply --confirm-apply`.
 */
const args = process.argv.slice(2);
if (!args.includes("--dry-run")) {
  console.error("backfill-visual-description.ts is retired. Use: scripts/repair-media-analysis.ts preview, then apply --confirm-apply (see its header).");
  process.exit(2);
}
const clone = args.indexOf("--clone") >= 0 ? ["--clone", args[args.indexOf("--clone") + 1]] : [];
process.argv = [process.argv[0], process.argv[1], "inventory", ...clone];
console.log("backfill-visual-description is retired: forwarding --dry-run to `repair-media-analysis.ts inventory`");
import("./repair-media-analysis");

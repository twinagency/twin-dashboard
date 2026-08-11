import { loadBoard } from "@/lib/tracker";
import { TrackerBoard } from "./TrackerBoard";

// The tracker. Bugs, feature requests and anything else, in the dashboard the
// operator already has open, instead of in .txt files he cannot read.
//
// Three zones, top to bottom: the ARCHIVE of shipped batches (collapsed), the
// batch being worked right now, then the OPEN pile. An item is never filed
// under a date, because bugs roll on for days and a date log either repeats
// them or buries them. See ../../lib/tracker.ts and
// ../../../bot/db/migrations/110_tracker.sql for the full reasoning.

export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const board = await loadBoard();
  return <TrackerBoard board={board} />;
}

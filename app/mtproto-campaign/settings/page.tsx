import { connectionFor, listConnections } from "@/lib/mtproto/connections";
import { goLivePhraseFor, resumePhraseFor, shortId } from "@/lib/mtproto/halt";
import { autoHaltsFor } from "@/lib/mtproto/halt-server";
import { readMtprotoLimits } from "@/lib/mtproto/limits";
import SettingsView from "@/components/mtproto/SettingsView";
import { getCreators, getGlobalLiveArm, getGlobalStop, getSafety } from "@/components/mtproto/data";
import type { SettingsConnRow } from "@/components/mtproto/SettingsConnectionsTable";

export const dynamic = "force-dynamic";

// Settings tab (2026-09-23): the two fleet-wide switches, the tunable send
// limits (migration 169/171), and the per-creator LIVE/DRY + cap + pause
// controls that used to live on Connections, now in one compact place.
export default async function MtprotoSettingsPage() {
  const [creators, connections, safety, { stopped }, { armed }, limits] = await Promise.all([
    getCreators(),
    listConnections(),
    getSafety(),
    getGlobalStop(),
    getGlobalLiveArm(),
    // A failed read is shown as an error, never as defaults: saving defaults
    // would switch warm-up, min gap and the day-one cap off.
    readMtprotoLimits().then(
      (l) => ({ limits: l, error: null }),
      (e: unknown) => ({ limits: null, error: e instanceof Error ? e.message : "unreadable" }),
    ),
  ]);
  const halts = await autoHaltsFor(connections);
  const sentToday = new Map(safety.snapshots.map((s) => [s.cloneId, s.sentToday]));
  const connRows: SettingsConnRow[] = creators.map((c) => ({
    creator: c,
    connection: connectionFor(c.id, connections),
    autoHalt: halts.get(c.id) ?? null,
    resumePhrase: resumePhraseFor(c.name || shortId(c.id)),
    goLivePhrase: goLivePhraseFor(c.name || shortId(c.id)),
    sentToday: safety.error ? null : (sentToday.get(c.id) ?? 0),
  }));

  return <SettingsView globalStop={stopped} globalLiveArm={armed} connRows={connRows} limits={limits.limits} limitsError={limits.error} />;
}

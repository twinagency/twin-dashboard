"use client";

import GlobalLiveArmControl from "./GlobalLiveArmControl";
import GlobalStopControl from "./GlobalStopControl";
import MtprotoLimitsPanel from "./MtprotoLimitsPanel";
import SettingsConnectionsTable, { type SettingsConnRow } from "./SettingsConnectionsTable";
import { Panel } from "./kit";
import type { MtprotoLimits } from "@/lib/mtproto/types";

export default function SettingsView({
  globalStop,
  globalLiveArm,
  connRows,
  limits,
  limitsError,
}: {
  globalStop: boolean | null;
  globalLiveArm: boolean | null;
  connRows: SettingsConnRow[];
  limits: MtprotoLimits | null;
  limitsError: string | null;
}) {
  return (
    <div className="space-y-5">
      <Panel title="Global controls" tip="The two fleet-wide switches. Arming or stopping here affects every creator at once. Each creator still needs its own LIVE switch below, and each run its own live confirmation.">
        <div className="flex flex-wrap items-start gap-3">
          <GlobalLiveArmControl armed={globalLiveArm} />
          <GlobalStopControl stopped={globalStop} />
        </div>
      </Panel>

      <Panel title="Limits" tip="The fleet-wide send limits, read fresh by the worker on every pass. Every field is clamped to the same safe maximum the worker itself enforces, so nothing typed here can go past what it would already refuse.">
        {limits ? (
          <MtprotoLimitsPanel limits={limits} />
        ) : (
          <div role="alert" className="rounded-lg border border-crit/40 bg-crit/10 px-3 py-2 text-xs font-medium text-crit">
            Limits could not be read ({limitsError}). Saving is off until they load, so nothing overwrites the stored caps. Reload to try again.
          </div>
        )}
      </Panel>

      <Panel title="Per-creator controls" tip="LIVE/DRY, daily cap and pause/resume for each creator's own Telegram account. Every gate here is checked again on the server.">
        <SettingsConnectionsTable rows={connRows} />
      </Panel>
    </div>
  );
}

"use client";

import GlobalLiveArmControl from "./GlobalLiveArmControl";
import GlobalStopControl from "./GlobalStopControl";
import SettingsConnectionsTable, { type SettingsConnRow } from "./SettingsConnectionsTable";
import { Panel } from "./kit";

export default function SettingsView({
  globalStop,
  globalLiveArm,
  connRows,
}: {
  globalStop: boolean | null;
  globalLiveArm: boolean | null;
  connRows: SettingsConnRow[];
}) {
  return (
    <div className="space-y-5">
      <Panel title="Global controls" tip="The two fleet-wide switches. Arming or stopping here affects every creator at once. Each creator still needs its own LIVE switch below, and each run its own live confirmation.">
        <div className="flex flex-wrap items-start gap-3">
          <GlobalLiveArmControl armed={globalLiveArm} />
          <GlobalStopControl stopped={globalStop} />
        </div>
      </Panel>

      <Panel title="Per-creator controls" tip="LIVE/DRY, daily cap and pause/resume for each creator's own Telegram account. Every gate here is checked again on the server.">
        <SettingsConnectionsTable rows={connRows} />
      </Panel>
    </div>
  );
}

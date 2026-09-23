"use client";

import { CreatorAvatar, EmptyBlock, StatusPill } from "./kit";
import { connectionStatusInfo } from "./view";
import TelegramLoginControl from "./TelegramLoginControl";
import type { AutoHaltInfo, CreatorLite, UserbotConnection } from "@/lib/mtproto/types";

type ConnRow = { creator: CreatorLite; connection: UserbotConnection; autoHalt: AutoHaltInfo | null; resumePhrase: string; goLivePhrase: string; sentToday?: number | null; initialLoginRequest?: import("@/lib/mtproto/login-control").LoginRequestView | null };

// Pure connection state, nothing else. Caps, live/dry and pause controls now
// live on the Runs tab, where the sending actually happens. This list only
// answers one question per creator: is Telegram connected or not.
function ConnectionRow({ row }: { row: ConnRow }) {
  const { creator, connection } = row;
  const status = connectionStatusInfo(connection);
  const connected = connection.status === "connected";

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 sm:flex-nowrap">
      <CreatorAvatar id={creator.id} name={creator.name} className="size-8 text-xs" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{creator.name}</span>
      <StatusPill tone={status.tone} dot title={status.hint}>
        {status.label}
      </StatusPill>
      <TelegramLoginControl
        cloneId={creator.id}
        creatorName={creator.name}
        connected={connected}
        initialRequest={row.initialLoginRequest ?? null}
        initialPhone={creator.accountPhone}
      />
    </div>
  );
}

export default function ConnectionsTable({ rows }: { rows: ConnRow[] }) {
  if (rows.length === 0) {
    return <EmptyBlock icon="◌" title="No creators yet" hint="Creators appear here once they exist in the dashboard. Each one gets its own Telegram login." />;
  }
  // Connected accounts first.
  const sorted = [...rows].sort((a, b) => Number(b.connection.status === "connected") - Number(a.connection.status === "connected"));
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow-card)]">
      {sorted.map((r) => (
        <ConnectionRow key={r.creator.id} row={r} />
      ))}
    </div>
  );
}

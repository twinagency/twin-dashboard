"use client";

import { useState, type ReactNode } from "react";
import { useDashboardAccess } from "./DashboardAccessProvider";
import { usesCompactWorkspace } from "@/lib/compact-workspace";

/** Keep the real server-rendered fan list, history, composer and dossier mounted. */
export default function MessagesWorkspace({ selected, children }: { selected: boolean; children: ReactNode }) {
  const { audience, agencyName } = useDashboardAccess();
  const [panel, setPanel] = useState(selected ? "chat" : "list");
  if (!usesCompactWorkspace(audience, agencyName)) return <div className="grid gap-3 lg:h-full lg:grid-cols-3">{children}</div>;
  return <div className="compact-messages" data-message-panel={panel}>
    <nav className="compact-message-switch" aria-label="Message panels">
      {[["list", "Conversations"], ["chat", "Chat & history"], ["profile", "Profile & memory"]].map(([value, label]) => <button key={value} type="button" aria-pressed={panel === value} onClick={() => setPanel(value)}>{label}</button>)}
    </nav>
    <div className="compact-message-grid">{children}</div>
  </div>;
}

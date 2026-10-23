"use client";

import { useState, type ReactNode } from "react";
import { MessageCircle, UsersRound, ContactRound } from "lucide-react";
import "./telegram-live.css";

/** Presentation only: keep the existing server data and live client islands mounted. */
export default function TelegramLiveWorkspace({ selected, children }: { selected: boolean; children: ReactNode }) {
  const [panel, setPanel] = useState(selected ? "chat" : "list");
  return <div className="telegram-live-workspace" data-live-panel={panel}>
    <nav className="telegram-panel-switch" aria-label="Message panels">
      {([
        ["list", "Conversations", UsersRound],
        ["chat", "Chat", MessageCircle],
        ["profile", "Fan details", ContactRound],
      ] as const).map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={panel === value} onClick={() => setPanel(value)}><Icon size={16} aria-hidden="true" />{label}</button>)}
    </nav>
    <div className="telegram-live-grid">{children}</div>
  </div>;
}

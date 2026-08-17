"use client";

import { useEffect, useState } from "react";
import { onLive, lastDrip, isTyping } from "@/lib/live-bus";

const chip = "shrink-0 rounded-full px-1.5 py-px text-[9px] font-medium leading-[14px]";

// The two live bits inside a fan row. Everything else in that row stays server
// rendered, so this is a deliberately tiny client island: it subscribes to ONE
// fan and re-renders only when that fan changes.
//
// The server-rendered drip chip is passed in as initialStep/initialTotal and
// used until the feed says otherwise, so the row is correct before the stream
// connects and stays correct if it never does.
export default function FanLive({
  fanId,
  initialStep,
  initialTotal,
  initialEnabled,
}: {
  fanId: string;
  initialStep: number;
  initialTotal: number;
  initialEnabled: boolean;
}) {
  const [drip, setDrip] = useState<{ step: number; total: number; enabled: boolean }>({
    step: initialStep,
    total: initialTotal,
    enabled: initialEnabled,
  });
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    // Catch up on anything the feed already said about this fan before this row
    // mounted (a "Load more", or a re-render after selecting someone).
    const seen = lastDrip(fanId);
    if (seen) setDrip({ step: seen.step, total: seen.total, enabled: seen.enabled });
    setTyping(isTyping(fanId));

    return onLive((event) => {
      if (event.t === "drip" && event.fanId === fanId) {
        setDrip({ step: event.step, total: event.total, enabled: event.enabled });
      } else if (event.t === "typing" && event.fanId === fanId) {
        setTyping(event.typing);
      }
    });
  }, [fanId]);

  return (
    <>
      {typing && (
        <span
          className={chip + " bg-accent/15 text-accent"}
          title="She is composing a reply to this fan right now. Derived from his message having no reply after it yet, so it clears the moment she sends."
        >
          <span className="typing-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="sr-only">she is typing</span>
        </span>
      )}
      {/* Zero is not shown: it is the normal state of a fan who just messaged,
          not information. Same rule the server-rendered chip used. */}
      {drip.step > 0 && drip.total > 0 && (
        <span
          className={chip + " bg-purple-500/15 text-purple-400"}
          title={`Automated campaign: ${drip.step} of ${drip.total} steps sent this quiet episode. Resets to 0 the moment he messages.${drip.enabled ? "" : " The campaign is currently OFF for this clone."}`}
        >
          💧 drip {drip.step}/{drip.total}
        </span>
      )}
    </>
  );
}

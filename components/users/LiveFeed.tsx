"use client";

import { useEffect } from "react";
import { emitLive, rememberLive, type LiveEvent } from "@/lib/live-bus";

// The single EventSource for /users. Mounted once by the page; renders nothing.
//
// Native EventSource rather than the hand-rolled fetch+getReader loop the AI
// assistant uses (app/ai/AiChat.tsx): that one has to POST a body, this one is
// a plain GET, and EventSource gives us automatic reconnect with backoff for
// free. The server sends a `: ping` comment every 20s, which EventSource
// silently swallows, purely to stop Apache's 60s ProxyTimeout from cutting an
// idle feed.
export default function LiveFeed() {
  useEffect(() => {
    // document.hidden guard, same convention as app/logs/AutoRefresh.tsx: a
    // background tab holds an open stream and a Supabase poll loop on the
    // server for nothing. Closing it on hide and reopening on show is the
    // difference between one live tab and twelve forgotten ones.
    let es: EventSource | null = null;

    const open = () => {
      if (es || document.hidden) return;
      es = new EventSource("/api/users/live");
      es.onmessage = (e) => {
        let event: LiveEvent;
        try {
          event = JSON.parse(e.data);
        } catch {
          return;
        }
        rememberLive(event);
        emitLive(event);
      };
      // EventSource reconnects on its own after an error, but it does NOT if we
      // leave a dead handle around, so drop it and let visibility/interval
      // reopen. Silent by design: a feed that cannot connect degrades to the
      // server-rendered values already on screen, which are correct, just not
      // live.
      es.onerror = () => {
        es?.close();
        es = null;
      };
    };

    const close = () => {
      es?.close();
      es = null;
    };

    const onVisibility = () => (document.hidden ? close() : open());

    open();
    document.addEventListener("visibilitychange", onVisibility);
    // Reopen after an error while the tab stayed visible the whole time.
    const retry = setInterval(() => open(), 15_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(retry);
      close();
    };
  }, []);

  return null;
}

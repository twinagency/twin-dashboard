"use client";

// Tiny event bus so the version chip in the sidebar can open the "Twin updated"
// popup on demand, while the popup itself stays mounted once in the layout
// (outside the sidebar, so a phone gets it too).
//
// Same shape as lib/clone-switcher-bus.ts, and for the same reason: the two
// components are in different branches of the tree, and threading a callback
// through the layout to the sidebar to the chip would be worse than an event.
const EVENT = "twin-update:open";

export function openTwinUpdate() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function onOpenTwinUpdate(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

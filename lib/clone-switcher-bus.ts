"use client";

// Tiny event bus so components outside CloneSwitcher (e.g. Sidebar's PPVs/Edit
// rows) can open the "Switch clone" popup instead of navigating anywhere.
// Enforces the rule that the "All clones" view never edits a single girl's
// config: a girl-only nav row with no clone picked opens the picker rather
// than silently doing nothing or guessing a clone.
const EVENT = "clone-switcher:open";

export function openCloneSwitcher() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function onOpenCloneSwitcher(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

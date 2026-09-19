"use client";

// The "Twin updated" popup, shown once per browser after a new release, plus
// the version chip's markup (migration 117).
//
// OPERATOR ASK, 2026-08-13: "somewhere in sidebar or dash screen to show what
// version of twin were on... and a pop up saying twin update x v x and the small
// description there too, for first time a user opens dash after update."
//
// SPLIT IN TWO ON PURPOSE. The CHIP is plain markup rendered inside the sidebar,
// which only exists at lg+. The POPUP is mounted once in the layout, outside the
// sidebar, so a phone still gets it. Mounting one component in both places would
// mean two popups racing to write the same "seen" mark.
//
// WHY localStorage AND NOT A DATABASE COLUMN. "First time a user opens the dash
// after an update" is a per-BROWSER fact, and this dashboard has one shared
// login, so there is no per-user row to hang it on. A column would show the
// popup to whoever opened it first and to nobody else, which is the opposite of
// the ask. The failure mode if storage is cleared is one extra popup, never a
// missed one.
//
// IT NEVER FIRES ON A FIRST EVER VISIT: a browser with no mark gets the mark
// written silently, and the popup waits for a real CHANGE of version.

import { useEffect, useState } from "react";
import { openTwinUpdate, onOpenTwinUpdate } from "@/lib/twin-update-bus";

const SEEN_KEY = "twin.version.seen";

/** The chip. Clicking it reopens the release notes (operator ask, 2026-08-13:
 *  "I wanna be able to click that and it opens the pop up as well"). Stateless
 *  itself: it fires an event and the popup below owns the state, so there is
 *  exactly one popup no matter how many places render a chip. */
export function TwinVersionChip({
  version,
  name,
  summary,
}: {
  version: string | null;
  name: string;
  summary: string;
}) {
  if (!version) return null;
  return (
    <button
      type="button"
      onClick={openTwinUpdate}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/55 transition hover:border-white/30 hover:text-white/80"
      title={summary ? `${summary}\n\nClick to read again` : `FLIRT v${version}`}
      aria-label={`FLIRT version ${version}, open release notes`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      FLIRT v{version}
      {name ? <span className="text-white/40">{name}</span> : null}
    </button>
  );
}

/** The popup. Mounted ONCE, in the layout. */
export type TwinChange = { kind: "feature" | "fix"; title: string; detail: string };

export default function TwinUpdatePopup({
  version,
  name,
  summary,
  changes = [],
}: {
  version: string | null;
  name: string;
  summary: string;
  changes?: TwinChange[];
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!version) return;
    try {
      const seen = window.localStorage.getItem(SEEN_KEY);
      if (!seen) {
        window.localStorage.setItem(SEEN_KEY, version); // first ever visit: mark, stay quiet
        return;
      }
      if (seen !== version) setShow(true);
    } catch {
      // Private mode / storage disabled: no auto popup. The chip still opens it.
    }
  }, [version]);

  // Opened by hand from the chip. Deliberately NOT gated on the seen mark: the
  // whole point is being able to read the notes again after dismissing them.
  useEffect(() => onOpenTwinUpdate(() => setShow(true)), []);

  function dismiss() {
    setShow(false);
    try {
      if (version) window.localStorage.setItem(SEEN_KEY, version);
    } catch {
      /* it simply shows again next load, which is harmless */
    }
  }

  if (!show || !version) return null;

  const features = changes.filter((c) => c.kind === "feature");
  const fixes = changes.filter((c) => c.kind !== "feature");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="twin-update-title"
      onClick={dismiss}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header. The number and the word "update" are the whole message here;
            the batch it came from is internal and is deliberately not shown. */}
        <div className="shrink-0 border-b border-black/6 bg-gradient-to-br from-neutral-900 to-neutral-700 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-300">
              UPDATE
            </span>
            <span className="text-[11px] text-white/50">just shipped</span>
          </div>
          <h2 id="twin-update-title" className="mt-1.5 font-display text-xl font-semibold">
            FLIRT v{version}
            {name ? <span className="ml-2 text-base font-normal text-white/50">{name}</span> : null}
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {features.length > 0 && (
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">New</h3>
              <ul className="mt-2 space-y-3">
                {features.map((c, i) => (
                  <li key={`f${i}`} className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">{c.title}</p>
                      {c.detail && <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{c.detail}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {fixes.length > 0 && (
            <section className={features.length > 0 ? "mt-5" : ""}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Fixed</h3>
              <ul className="mt-2 space-y-3">
                {fixes.map((c, i) => (
                  <li key={`x${i}`} className="flex gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">{c.title}</p>
                      {c.detail && <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{c.detail}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* No structured notes on this row (an older release): fall back to
              the paragraph rather than showing an empty popup. */}
          {features.length === 0 && fixes.length === 0 && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
              {summary || "FLIRT has been updated."}
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-black/6 px-5 py-3">
          <button
            onClick={dismiss}
            className="w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

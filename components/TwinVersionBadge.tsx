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

const SEEN_KEY = "twin.version.seen";

/** The chip. Plain, stateless, safe to render anywhere in the shell. */
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
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/55"
      title={summary || `Twin v${version}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      Twin v{version}
      {name ? <span className="text-white/40">{name}</span> : null}
    </span>
  );
}

/** The popup. Mounted ONCE, in the layout. */
export default function TwinUpdatePopup({
  version,
  name,
  summary,
}: {
  version: string | null;
  name: string;
  summary: string;
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
      // Private mode / storage disabled: no popup. The chip still renders.
    }
  }, [version]);

  function dismiss() {
    setShow(false);
    try {
      if (version) window.localStorage.setItem(SEEN_KEY, version);
    } catch {
      /* it simply shows again next load, which is harmless */
    }
  }

  if (!show || !version) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="twin-update-title"
      onClick={dismiss}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            UPDATE
          </span>
          <h2 id="twin-update-title" className="text-base font-semibold text-neutral-900">
            Twin v{version}
            {name ? <span className="ml-1.5 font-normal text-neutral-500">{name}</span> : null}
          </h2>
        </div>
        {summary ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{summary}</p>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">Twin has been updated.</p>
        )}
        <button
          onClick={dismiss}
          className="mt-4 w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import type { CloneDefaultStatus } from "@/app/settings/actions";
import { setCloneUsesDefault, pushDefaultsToClones } from "@/app/settings/actions";

// Shows every clone's fleet-default sync status (2026-09-01, part of the
// defaults-audit pass): which are following the template above and which
// have been detached onto their own custom config, plus a manual "Push to
// selected clones now" action for syncing one without waiting on the next
// template Save. See app/settings/actions.ts for what "push" actually writes
// (the same DEFAULT_* config surface the template form above submits, never
// identity/persona, never category_pricing — that one's per-clone on PPVs now).
export default function CloneDefaultSyncTable({ clones }: { clones: CloneDefaultStatus[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pushing, startPush] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleDefault(clone: CloneDefaultStatus) {
    setBusyId(clone.id);
    try {
      await setCloneUsesDefault(clone.id, !clone.usesDefault);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  function pushSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    setMsg(null);
    startPush(async () => {
      await pushDefaultsToClones(ids);
      setMsg(`Pushed the current default onto ${ids.length} clone${ids.length === 1 ? "" : "s"}.`);
      setSelected(new Set());
      router.refresh();
    });
  }

  const followingCount = clones.filter((c) => c.usesDefault).length;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {followingCount} of {clones.length} following the fleet default. Saving the template above pushes to every
          &quot;Default&quot; clone automatically; use the button below to push to a &quot;Custom&quot; clone on demand without
          switching it.
        </span>
        <Button type="button" size="sm" disabled={selected.size === 0 || pushing} onClick={pushSelected}>
          {pushing ? "Pushing…" : `Push to selected (${selected.size})`}
        </Button>
      </div>

      {msg && <div className="rounded-md border border-line bg-panel px-3 py-2 text-xs text-muted">{msg}</div>}

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-muted/5 text-left text-muted">
              <th className="w-8 py-2 pl-3" />
              <th className="py-2 pr-4 font-medium">Clone</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-3 text-right font-medium">Follow default</th>
            </tr>
          </thead>
          <tbody>
            {clones.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="py-2 pl-3">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelected(c.id)} />
                </td>
                <td className="creator-name py-2 pr-4 font-medium">
                  {c.name} <span className="text-muted">/ {c.slug}</span>
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                      (c.usesDefault ? "bg-good/15 text-good" : "bg-muted/10 text-muted")
                    }
                  >
                    {c.usesDefault ? "Following default" : "Custom config"}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right">
                  <button
                    type="button"
                    disabled={busyId === c.id}
                    onClick={() => toggleDefault(c)}
                    className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-muted/10 disabled:opacity-40"
                  >
                    {busyId === c.id ? "…" : c.usesDefault ? "Switch to custom" : "Switch to default"}
                  </button>
                </td>
              </tr>
            ))}
            {clones.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted">
                  No clones yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

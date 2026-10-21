"use client";

import { useMemo, useState, type MouseEvent } from "react";
import Link from "@/components/NavigationLink";
import CreatorAvatar from "@/components/CreatorAvatar";
import type { CloneCard } from "./ClonesGrid";
import { cloneCohortLabel } from "@/lib/clone-cohort";

export default function TwinCreatorRoster({ clones, preview, readOnly = true, onTogglePause }: { clones: CloneCard[]; preview: boolean; readOnly?: boolean; onTogglePause?: (event: MouseEvent, creator: CloneCard) => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const counts = { all: clones.length, active: clones.filter(c => c.active && !c.onboarding).length, paused: clones.filter(c => !c.active && !c.onboarding).length, setup: clones.filter(c => c.onboarding).length };
  const filtered = useMemo(() => clones.filter(c => {
    const matches = `${c.name} ${c.slug}`.toLowerCase().includes(query.trim().toLowerCase());
    return matches && (status === "all" || status === "setup" && c.onboarding || status === "active" && !c.onboarding && c.active || status === "paused" && !c.onboarding && !c.active);
  }), [clones, query, status]);
  const selected = filtered.find(c => c.id === selectedId) ?? filtered[0];
  const href = (c: CloneCard) => preview ? "/revenue" : c.onboarding ? "/agency/creators" : `/clones/${c.id}`;
  return <div className="twin-roster">
    <div className="twin-toolbar">
      <input aria-label="Search creators" placeholder="Search creators by name or username…" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="twin-filter-pills" aria-label="Creator status">{([['all','All'],['active','Active'],['paused','Paused'],['setup','Setup pending']] as const).map(([key,label]) => <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)}>{label}<span>{counts[key]}</span></button>)}</div>
    </div>
    <div className="twin-roster-layout">
      <section className="twin-surface twin-roster-table" aria-label="Creator roster">
        <div className="twin-table-scroll"><table><thead><tr><th>Creator</th><th>Bot status</th><th>Content enabled</th><th>System</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {filtered.map(c => <tr key={c.id} data-selected={selected?.id === c.id || undefined}>
            <td><button type="button" className="twin-roster-identity" aria-pressed={selected?.id === c.id} onClick={() => setSelectedId(c.id)}><CreatorAvatar name={c.name} photoUrl={c.photoUrl} className="h-12 w-12" /><span><strong className="creator-name">{c.name}</strong><small>{c.slug ? `/${c.slug}` : "Onboarding in progress"}</small></span></button></td>
            <td><button type="button" disabled={readOnly || preview || c.onboarding || !onTogglePause} onClick={e => onTogglePause?.(e,c)} title={c.onboarding ? "Setup pending" : readOnly ? "Read only" : c.active ? "Pause this bot" : "Resume this bot"} className="twin-status" data-tone={c.onboarding ? "pending" : c.active ? "good" : "neutral"}>{c.onboarding ? "Setup pending" : c.active ? "Active" : "Paused"}</button></td>
            <td><div className="twin-feature-list">{c.features.length ? c.features.map(f => <span key={f}>{f}</span>) : <span>None enabled</span>}</div></td>
            <td>{c.onboarding ? "—" : cloneCohortLabel(c.cohort)}</td>
            <td><Link className="twin-outline-link" href={href(c)}>{c.onboarding ? "Continue setup" : "Open creator"}<span aria-hidden="true"> ↗</span></Link></td>
          </tr>)}
        </tbody></table></div>
        {!filtered.length && <p className="twin-empty" role="status">No creators match these filters.</p>}
        <footer>{filtered.length} of {clones.length} creators</footer>
      </section>
      {selected && <aside className="twin-surface twin-roster-inspector" aria-label="Selected creator">
        <CreatorAvatar name={selected.name} photoUrl={selected.photoUrl} className="h-20 w-20" />
        <h2 className="creator-name">{selected.name}</h2><p>{selected.slug ? `/${selected.slug}` : "Creator onboarding"}</p>
        <dl><div><dt>Bot status</dt><dd>{selected.onboarding ? "Setup pending" : selected.active ? "Active" : "Paused"}</dd></div><div><dt>Content enabled</dt><dd>{selected.features.join(" · ") || "None enabled"}</dd></div>{!selected.onboarding && <div><dt>System</dt><dd>{cloneCohortLabel(selected.cohort)}</dd></div>}</dl>
        <Link href={href(selected)} className="twin-primary-link">{selected.onboarding ? "Continue setup" : "Open creator workspace"} →</Link>
        <p className="twin-help">{selected.onboarding ? "Review the existing onboarding record to finish setup." : "Review profile, reply settings, content and pricing in this creator’s workspace."}</p>
      </aside>}
    </div>
  </div>;
}

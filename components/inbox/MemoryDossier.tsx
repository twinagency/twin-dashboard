'use client';

import { useId, useState, type ReactNode } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import type { Fan, Memory, Platform } from '../fans/types';
import { platformNames } from '../fans/model';
import styles from './UnifiedInbox.module.css';

type MemoryRow = { label: string; memories: Memory[] };
type MemoryGroup = { label: string; rows: MemoryRow[] };

// Group existing records without extracting new facts or discarding their sources.
export function memoryGroups(memories: Memory[]): MemoryGroup[] {
  const personal = ['Home & work', 'Name & language', 'Local time & availability', 'Hobbies & interests', 'Birthday / age', 'Family / children', 'Relationship', 'Education', 'Pets'];
  const context = ['Current projects', 'Communication preferences', 'Content preferences', 'Shared history', 'Follow-ups & plans'];
  const groups: MemoryGroup[] = [
    { label: 'Personal details', rows: personal.map(label => ({ label, memories: [] })) },
    { label: 'Context & preferences', rows: context.map(label => ({ label, memories: [] })) },
  ];
  const other: MemoryRow[] = [];
  for (const memory of memories) {
    const label = memory.label.toLowerCase();
    const category = memory.category.toLowerCase();
    let target: string | undefined;
    if (/current project|current work context/.test(label)) target = 'Current projects';
    else if (category === 'open follow-ups') target = 'Follow-ups & plans';
    else if (category === 'shared history') target = 'Shared history';
    else if (category === 'content preferences') target = 'Content preferences';
    else if (category === 'conversation preferences') target = 'Communication preferences';
    else if (category.includes('interest')) target = 'Hobbies & interests';
    else if (category === 'personal details') {
      if (/home|location|occupation|work/.test(label)) target = 'Home & work';
      else if (/name|language/.test(label)) target = 'Name & language';
      else if (/local|timezone|availability|routine/.test(label)) target = 'Local time & availability';
      else if (/birthday|age/.test(label)) target = 'Birthday / age';
      else if (/family|children|siblings/.test(label)) target = 'Family / children';
      else if (/relationship/.test(label)) target = 'Relationship';
      else if (/education/.test(label)) target = 'Education';
      else if (/pets?/.test(label)) target = 'Pets';
    }
    const row = groups.flatMap(group => group.rows).find(row => row.label === target);
    if (row) row.memories.push(memory);
    else {
      let extra = other.find(row => row.label === memory.category);
      if (!extra) { extra = { label: memory.category, memories: [] }; other.push(extra); }
      extra.memories.push(memory);
    }
  }
  if (other.length) groups.push({ label: 'Other details', rows: other });
  return groups;
}

function Dropdown({ label, summary, stored, group = false, forceOpen, children }: {
  label: string; summary: string; stored: boolean; group?: boolean; forceOpen: boolean; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const open = expanded || forceOpen;
  return <section className={`${styles.dossierDropdown} ${group ? styles.dossierGroup : ''}`} data-stored={stored}>
    <button type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setExpanded(!expanded)}>
      <span className={styles.dossierHeading}><strong>{label}</strong><small>{summary}</small></span>
      <span className={styles.storedDot} aria-label={stored ? 'Stored information' : 'No stored information'} />
      <ChevronDown size={14} aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined }} />
    </button>
    <div id={id} hidden={!open} className={styles.dossierContents}>{children}</div>
  </section>;
}

export default function MemoryDossier({ fan, overrides, showSource }: {
  fan: Fan; overrides: Record<string, string>; showSource: (platform: Platform, id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const search = query.trim().toLowerCase();
  const groups = memoryGroups(fan.memories);
  const value = (memory: Memory) => overrides[memory.id] ?? memory.value;
  const hasValue = (memory: Memory) => !!value(memory).trim();
  const visible = groups.map(group => ({ ...group, rows: group.rows.map(row => ({ ...row,
    visible: !search || `${group.label} ${row.label}`.toLowerCase().includes(search)
      ? row.memories : row.memories.filter(memory => `${memory.label} ${value(memory)} ${platformNames[memory.source]}`.toLowerCase().includes(search)),
  })).filter(row => !search || row.visible.length || `${group.label} ${row.label}`.toLowerCase().includes(search)) })).filter(group => group.rows.length);
  return <div className={styles.dossier} aria-label="Relationship memory">
    <div className={styles.dossierSummary}><strong>Profile summary</strong><p>{fan.summary || 'Not learned yet'}</p></div>
    <div className={styles.contextSummary}>{fan.memories.filter(hasValue).length} stored details · {fan.accounts.length} linked {fan.accounts.length === 1 ? 'account' : 'accounts'}</div>
    <input aria-label="Search inbox memory" placeholder="Find a stored detail…" value={query} onChange={event => setQuery(event.target.value)} />
    {visible.map(group => {
      const allRows = groups.find(item => item.label === group.label)!.rows;
      const stored = allRows.filter(row => row.memories.some(hasValue)).length;
      return <Dropdown key={group.label} label={group.label} summary={`${stored} of ${allRows.length} categories stored`} stored={stored > 0} group forceOpen={!!search}>
        {group.rows.map(row => {
          const count = row.memories.filter(hasValue).length;
          return <Dropdown key={row.label} label={row.label} summary={count ? `${count} stored ${count === 1 ? 'detail' : 'details'}` : 'Not learned yet'} stored={count > 0} forceOpen={!!search}>
            {row.visible.filter(hasValue).map(memory => <article key={memory.id} className={styles.dossierFact} data-memory-id={memory.id}>
              <strong>{memory.label}</strong><p>{value(memory)}</p>
              <div><span className={`${styles.badge} ${styles[memory.source]}`}>{platformNames[memory.source]}</span><time dateTime={memory.updatedAt}>{new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Brisbane' }).format(new Date(memory.updatedAt))}</time></div>
              {memory.sourceMessageId && <button type="button" onClick={() => showSource(memory.source, memory.sourceMessageId!)}>View source<ArrowUpRight size={12} /></button>}
            </article>)}
            {!count && <p className={styles.notLearned}>Not learned yet</p>}
          </Dropdown>;
        })}
      </Dropdown>;
    })}
    {!visible.length && <p className={styles.notLearned}>No matching memories.</p>}
  </div>;
}

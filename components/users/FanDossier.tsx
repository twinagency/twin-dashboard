"use client";

import { Collapse } from "@/components/clone/fields";
import type { DossierRow, FanEvent } from "@/lib/fan-dossier";

// The knowledge dossier on the Fans page, right hand column.
//
// Twenty one always-open rows of mostly "Not learned yet" was the complaint
// (Jesse, 2026-08-18): the panel was a wall, and the eight facts she actually
// wanted were buried in it. So the two groups are collapsible parents, and
// every category inside them is its own collapsible child. Nothing shows its
// contents until that specific dropdown is opened.
//
// Built on the same Collapse primitive as the clone editor rather than a local
// <details>, so the dossier and the Edit page look like the same product: same
// chevron, same emoji chip, same spacing, same accent bar.
//
// A closed EMPTY category still says "Not learned yet" on its own row, because
// the point of listing all 21 is telling the operator what she has not asked
// about yet. A closed category that HAS data says nothing but shows a filled
// dot: previewing the value in the header would defeat the collapsing.
//
// Client component for the open/closed state. Every prop is plain data, and
// anything date shaped was already parsed and sorted server side in
// lib/fan-dossier.ts, so this file never reads a clock and cannot hydrate
// differently from what the server sent.

const NOT_LEARNED = "Not learned yet";

function countLearned(rows: DossierRow[], extra: number[] = []): { filled: number; total: number } {
  const filled = rows.filter((r) => r.items.length > 0).length + extra.filter((n) => n > 0).length;
  return { filled, total: rows.length + extra.length };
}

// One category's contents. A single fact reads better as a plain line than as
// a one item bullet list, so it only becomes a list when there is more than one.
function Values({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-[11px] italic leading-relaxed text-muted/70">{NOT_LEARNED}</p>;
  }
  if (items.length === 1) {
    return <p className="text-[11px] font-medium leading-relaxed text-ink">{items[0]}</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-1.5 text-[11px] font-medium leading-relaxed text-ink">
          <span aria-hidden className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-accent/60" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CategoryCollapse({ row }: { row: DossierRow }) {
  const has = row.items.length > 0;
  return (
    <Collapse
      emoji={row.emoji}
      label={row.label}
      accent={has ? "blue" : "neutral"}
      filled={has}
      // Only the empty ones preview, and only to say they are empty.
      summary={has ? undefined : NOT_LEARNED}
    >
      <Values items={row.items} />
    </Collapse>
  );
}

// Events get their own shape: one card each, never one paragraph, with the
// date on its own line. Ordering is done server side, soonest first for
// upcoming and most recent first for past.
function EventList({ events, emptyLabel }: { events: FanEvent[]; emptyLabel: string }) {
  if (events.length === 0) {
    return <p className="text-[11px] italic leading-relaxed text-muted/70">{emptyLabel}</p>;
  }
  return (
    <ol className="flex flex-col gap-2">
      {events.map((e, i) => (
        <li key={i} className="rounded-lg border border-line bg-bg/60 px-2.5 py-2">
          {e.when && (
            <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-semibold text-accent">
              <span aria-hidden>🗓️</span>
              {e.when}
            </div>
          )}
          <p className="text-[11px] font-medium leading-relaxed text-ink">{e.text}</p>
        </li>
      ))}
    </ol>
  );
}

function EventsCollapse({
  label,
  emoji,
  events,
}: {
  label: string;
  emoji: string;
  events: FanEvent[];
}) {
  const has = events.length > 0;
  return (
    <Collapse
      emoji={emoji}
      label={label}
      accent={has ? "blue" : "neutral"}
      filled={has}
      summary={has ? undefined : NOT_LEARNED}
      hint={
        label === "Upcoming events"
          ? "Everything he has said is still ahead of him, soonest first. Dates are read out of his own words, so an event with no date sits at the bottom."
          : undefined
      }
    >
      <EventList events={events} emptyLabel={NOT_LEARNED} />
    </Collapse>
  );
}

export default function FanDossier({
  summary,
  personal,
  contextRows,
  upcomingEvents,
  recentEvents,
  other,
}: {
  summary: string;
  personal: DossierRow[];
  // The context group MINUS the two event categories, which render above it
  // with their own event shape.
  contextRows: DossierRow[];
  upcomingEvents: FanEvent[];
  recentEvents: FanEvent[];
  other: DossierRow[];
}) {
  const personalCount = countLearned(personal);
  const contextCount = countLearned(contextRows, [upcomingEvents.length, recentEvents.length]);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Summary stays open. It is one short paragraph and it is the thing the
          operator wants before he types, so hiding it behind a click would be
          collapsing for its own sake. */}
      <div className="rounded-lg border border-line bg-bg/60 p-2.5">
        <div className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
          <span aria-hidden>📝</span>
          Profile summary
        </div>
        <p className={`text-xs leading-relaxed ${summary ? "text-ink" : "italic text-muted"}`}>
          {summary || NOT_LEARNED}
        </p>
      </div>

      <Collapse
        emoji="👤"
        label="Personal details"
        accent="purple"
        filled={personalCount.filled > 0}
        summary={`${personalCount.filled} of ${personalCount.total} learned`}
        hint="Who he is. Each category opens on its own, and anything still blank is a question she has not asked him yet."
      >
        <div className="flex flex-col gap-2">
          {personal.map((row) => (
            <CategoryCollapse key={row.label} row={row} />
          ))}
        </div>
      </Collapse>

      <Collapse
        emoji="🧭"
        label="Context & preferences"
        accent="cyan"
        filled={contextCount.filled > 0}
        summary={`${contextCount.filled} of ${contextCount.total} learned`}
        hint="What is going on in his life and how he likes to be talked to. Upcoming events are in date order, soonest first."
      >
        <div className="flex flex-col gap-2">
          <EventsCollapse label="Upcoming events" emoji="📅" events={upcomingEvents} />
          <EventsCollapse label="Recent events" emoji="🕘" events={recentEvents} />
          {contextRows.map((row) => (
            <CategoryCollapse key={row.label} row={row} />
          ))}
        </div>
      </Collapse>

      {other.length > 0 && (
        <Collapse
          emoji="🗂️"
          label="Other details"
          accent="amber"
          filled
          summary={`${other.length} extra`}
          hint="Facts the extractor recorded under its own key, so they did not land in one of the categories above."
        >
          <div className="flex flex-col gap-2">
            {other.map((row) => (
              <CategoryCollapse key={row.label} row={row} />
            ))}
          </div>
        </Collapse>
      )}

      <p className="text-[9px] leading-relaxed text-muted/75">
        Sensitive details are shown only when the fan states them directly; they are never inferred.
      </p>
    </div>
  );
}

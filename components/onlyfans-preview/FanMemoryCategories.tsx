"use client";

import { BriefcaseBusiness, CalendarDays, ChevronDown, Heart, MapPin, MessageSquare, NotebookPen, SlidersHorizontal, UserRound, UsersRound } from "lucide-react";
import { groupFanMemory, type FanMemoryCategoryId } from "@/lib/onlyfans-preview/fan-memory-groups";
import type { FanContextFact } from "@/lib/onlyfans-preview/types";

const icons = { identity: UserRound, interests: Heart, work: BriefcaseBusiness, preferences: SlidersHorizontal, location: MapPin, personal: UsersRound, dates: CalendarDays, requests: MessageSquare, notes: NotebookPen } satisfies Record<FanMemoryCategoryId, typeof UserRound>;
const sourceLabels = { creator: "Saved by creator", fan_correction: "Corrected by fan", purchase: "Purchase record", imported: "Saved from conversation" };

function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export default function FanMemoryCategories({ facts, displayName }: { facts: readonly FanContextFact[]; displayName?: string }) {
  const { groups, learning } = groupFanMemory(facts, displayName);
  const populated = groups.filter(group => group.items.length > 0).length;
  return <section className="of-memory" aria-label="Fan memory" data-of-fan-memory>
    <div className="of-memory-heading"><h3 className="of-section-heading">Fan memory</h3><span>{populated} of {groups.length} categories have info</span></div>
    <div className="of-memory-categories">{groups.map(group => {
      const Icon = icons[group.id];
      return <details key={group.id} className="of-memory-category" data-category={group.id}>
        <summary>
          <span className="of-memory-icon" aria-hidden="true"><Icon size={16} /></span>
          <span className="of-memory-category-label">{group.label}</span>
          <span className="of-memory-count" data-populated={group.items.length > 0}>{group.items.length ? `${group.items.length} saved` : "No info"}</span>
          <ChevronDown className="of-memory-chevron" size={13} aria-hidden="true" />
        </summary>
        {group.items.length ? <ul className="of-memory-items">{group.items.map((item, index) => <li key={`${item.label}-${index}`}>
          <span className="of-memory-field">{item.label}</span>
          <p>{item.value}</p>
          <span className="of-memory-source">{sourceLabels[item.source]}{item.learnedAt ? <> · <time dateTime={item.learnedAt}>{dateLabel(item.learnedAt)}</time></> : null}{item.qualifier && item.qualifier !== "current" ? ` · ${item.qualifier === "uncertain" ? "Mentioned in chat" : item.qualifier === "superseded" ? "Earlier information" : "Historical note"}` : ""}</span>
        </li>)}</ul> : <p className="of-memory-empty">{group.empty}</p>}
      </details>;
    })}</div>
    {learning.length ? <details className="of-memory-learning"><summary>Memory updates <ChevronDown size={13} aria-hidden="true" /></summary>{learning.map((item, index) => <p key={index}>{item.value}</p>)}</details> : null}
  </section>;
}

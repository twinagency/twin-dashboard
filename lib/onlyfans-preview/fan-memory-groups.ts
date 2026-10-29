import type { FanContextFact } from "./types";

export const FAN_MEMORY_CATEGORIES = [
  { id: "identity", label: "Name & age", empty: "No name or age saved yet." },
  { id: "interests", label: "Interests & hobbies", empty: "No interests or hobbies saved yet." },
  { id: "work", label: "Work & goals", empty: "No work or career goals saved yet." },
  { id: "preferences", label: "Likes & preferences", empty: "No preferences saved yet." },
  { id: "location", label: "Location & time zone", empty: "No location or time zone saved yet." },
  { id: "personal", label: "Personal life", empty: "No family, relationship or pet details saved yet." },
  { id: "dates", label: "Dates & events", empty: "No important dates or events saved yet." },
  { id: "requests", label: "Recent requests", empty: "No requests saved yet." },
  { id: "notes", label: "Notes & other memories", empty: "No other notes saved yet." },
] as const;

export type FanMemoryCategoryId = typeof FAN_MEMORY_CATEGORIES[number]["id"];
export type FanMemoryItem = FanContextFact & { learnedAt?: string; qualifier?: string };
export type FanMemoryGroup = typeof FAN_MEMORY_CATEGORIES[number] & { items: FanMemoryItem[] };

function categoryFor(label: string): FanMemoryCategoryId {
  const field = label.trim().toLowerCase().replace(/_/g, " ");
  if (/^(real name|full name|name|display name|age|his age)$/.test(field)) return "identity";
  if (/^(interests?|hobb(?:y|ies))$/.test(field)) return "interests";
  if (/^(occupation|job|work|career|goals?|aspirations?)$/.test(field)) return "work";
  if (/^(preferences?|preferred tone|likes|dislikes|boundaries|fetishes)$/.test(field)) return "preferences";
  if (/^(home city|home country|city|country|location|time ?zone)$/.test(field)) return "location";
  if (/^(personal life|family|relationships?|relationship status|pets?)$/.test(field)) return "personal";
  if (/^(events?|birthday|birth date|important dates?|dates?)$/.test(field)) return "dates";
  if (/^(requests?|recent requests?)$/.test(field)) return "requests";
  return "notes";
}

const summaryLabel = "Name|Real name|Full name|Age|Interests?|Hobbies|Occupation|Job|Work|Career|Goals?|Preferences?|Likes|Dislikes|Boundaries|Fetishes|Location|City|Country|Time ?zone|Family|Relationships?|Pets?|Events?|Birthday|Dates?|Requests?|Notes?";
const summaryStart = new RegExp(`^(${summaryLabel}):\\s*`, "i");
const summaryBoundary = new RegExp(`(?<=[.!?])\\s+(?=(?:${summaryLabel}):\\s*)|[\\r\\n]+(?=(?:${summaryLabel}):\\s*)`, "i");

/** Display-only projection. Never changes stored memory, confidence or AI context. */
export function groupFanMemory(facts: readonly FanContextFact[], displayName?: string) {
  const groups: FanMemoryGroup[] = FAN_MEMORY_CATEGORIES.map(category => ({ ...category, items: [] }));
  const learning: FanContextFact[] = [];
  const seen = new Map<string, FanMemoryItem>();
  const add = (item: FanMemoryItem) => {
    const category = categoryFor(item.label);
    const key = `${category}:${item.value.trim().toLocaleLowerCase()}:${category === "requests" ? item.learnedAt ?? "" : ""}`;
    const duplicate = seen.get(key);
    if (duplicate) {
      if (!duplicate.learnedAt && item.learnedAt) duplicate.learnedAt = item.learnedAt;
      if (!duplicate.qualifier && item.qualifier) duplicate.qualifier = item.qualifier;
      return;
    }
    seen.set(key, item);
    groups.find(group => group.id === category)!.items.push(item);
  };
  for (const fact of facts) {
    const label = fact.label.trim();
    if (/^creator profile coverage$/i.test(label) || !fact.value.trim()) continue;
    if (/^profile learning$/i.test(label)) { learning.push(fact); continue; }
    if (/^display name$/i.test(label) && fact.value === displayName) continue;
    if (!/^(conversation summary|saved profile|saved profile notes|short bio|bullet points)$/i.test(label)) {
      add({ ...fact });
      continue;
    }
    for (const part of fact.value.split(summaryBoundary).map(value => value.trim()).filter(Boolean)) {
      const field = part.match(summaryStart);
      // Preserve unstructured text in Notes instead of guessing its meaning.
      if (!field) { add({ ...fact, value: part }); continue; }
      const raw = part.slice(field[0].length);
      const meta = raw.match(/\s+\((current|uncertain|historical|superseded),\s*(\d{4}-\d{2}-\d{2})\)\.?$/i);
      const value = meta ? raw.slice(0, meta.index).trim() : raw;
      if (!value) { add({ ...fact, value: part }); continue; }
      // Keep a future career statement under goals without recasting it as a job.
      const itemLabel = /^event$/i.test(field[1]) && /^i(?:[’']m| am) going to be (?:a|an)\b/i.test(value) ? "Goal" : field[1];
      add({ label: itemLabel, value, source: fact.source, ...(meta ? { learnedAt: meta[2], qualifier: meta[1].toLowerCase() } : {}) });
    }
  }
  return { groups, learning };
}

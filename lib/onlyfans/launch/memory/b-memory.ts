/** Legacy design fixtures retained for historical review. Native operational memory uses native.ts and b-memory-client.ts. */
import { bId } from "../b-common";

export const COVERAGE_STATES = ["complete", "partial", "not_started", "unsupported"] as const;
export type CoverageState = typeof COVERAGE_STATES[number];
export const COVERAGE_TEXT: Record<CoverageState, string> = { complete: "Complete", partial: "Partial", not_started: "Not started", unsupported: "Not supported by the provider" };
export const FACT_SOURCES = ["history", "operator", "inferred"] as const;
export type FactSource = typeof FACT_SOURCES[number];
export const SOURCE_TEXT: Record<FactSource, string> = { history: "From chat history", operator: "Entered by an operator", inferred: "Inferred by the AI (unverified)" };

export type BFact = { factId: string; field: string; label: string; value: string; source: FactSource; updatedAt: string | null; editable: boolean };
export type BCoverage = { state: CoverageState; messagesImported: number | null; messagesKnownTotal: number | null; oldestAt: string | null; newestAt: string | null; memoryBuiltAt: string | null };
export type BFanMemory = { fanId: string; displayName: string; revision: number; summary: { text: string; updatedAt: string | null; source: FactSource } | null; facts: BFact[]; coverage: BCoverage };
export type BFanRow = { fanId: string; displayName: string; coverage: CoverageState; factCount: number };
export type BAccountCoverage = { coverage: BCoverage; fansTotal: number | null; fansWithMemory: number | null; fans: BFanRow[]; nextCursor: string | null };

export const MAX_FACT_VALUE = 500;
const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const stamp = (v: unknown) => v === null || (typeof v === "string" && Number.isFinite(Date.parse(v)));
const count = (v: unknown) => v === null || (Number.isSafeInteger(v) && (v as number) >= 0);

export function parseCoverage(v: unknown): BCoverage | null {
  if (!rec(v) || !(COVERAGE_STATES as readonly unknown[]).includes(v.state) || !count(v.messagesImported) || !count(v.messagesKnownTotal) ||
    !stamp(v.oldestAt) || !stamp(v.newestAt) || !stamp(v.memoryBuiltAt)) return null;
  if (typeof v.messagesImported === "number" && typeof v.messagesKnownTotal === "number" && v.messagesImported > v.messagesKnownTotal) return null;
  return v as BCoverage;
}
export function parseAccountCoverage(value: unknown, accountId: string): BAccountCoverage | null {
  if (!rec(value) || value.accountId !== accountId) return null;
  const coverage = parseCoverage(value.coverage);
  if (!coverage || !count(value.fansTotal) || !count(value.fansWithMemory) || !Array.isArray(value.fans) || value.fans.length > 200 ||
    !(value.nextCursor === null || typeof value.nextCursor === "string")) return null;
  const fans: BFanRow[] = [];
  for (const f of value.fans) {
    if (!rec(f) || !bId(f.fanId) || typeof f.displayName !== "string" || f.displayName.length > 160 || !(COVERAGE_STATES as readonly unknown[]).includes(f.coverage) || !count(f.factCount)) return null;
    fans.push(f as unknown as BFanRow);
  }
  return new Set(fans.map(f => f.fanId)).size === fans.length ? { coverage, fansTotal: value.fansTotal as number | null, fansWithMemory: value.fansWithMemory as number | null, fans, nextCursor: value.nextCursor as string | null } : null;
}
export function parseFanMemory(value: unknown, accountId: string, fanId: string): BFanMemory | null {
  if (!rec(value) || value.accountId !== accountId || value.fanId !== fanId || typeof value.displayName !== "string" || value.displayName.length > 160 ||
    !Number.isInteger(value.revision) || (value.revision as number) < 0 || !Array.isArray(value.facts) || value.facts.length > 200) return null;
  const coverage = parseCoverage(value.coverage);
  if (!coverage) return null;
  let summary: BFanMemory["summary"] = null;
  if (value.summary !== null) {
    const s = value.summary;
    if (!rec(s) || typeof s.text !== "string" || s.text.length > 4000 || !stamp(s.updatedAt) || !(FACT_SOURCES as readonly unknown[]).includes(s.source)) return null;
    summary = s as unknown as BFanMemory["summary"];
  }
  const facts: BFact[] = [];
  for (const f of value.facts) {
    if (!rec(f) || !bId(f.factId) || !bId(f.field) || typeof f.label !== "string" || f.label.length > 160 || typeof f.value !== "string" || f.value.length > 2000 ||
      !(FACT_SOURCES as readonly unknown[]).includes(f.source) || !stamp(f.updatedAt) || typeof f.editable !== "boolean") return null;
    facts.push(f as unknown as BFact);
  }
  return new Set(facts.map(f => f.factId)).size === facts.length ? { fanId, displayName: value.displayName, revision: value.revision as number, summary, facts, coverage } : null;
}

/** Local validation of a correction. The server contract must repeat this; the UI never trusts only itself. */
export function validateCorrection(value: string): string | null {
  const t = value.trim();
  if (!t) return "Enter a value, or use Clear to remove the fact.";
  if (t.length > MAX_FACT_VALUE) return `Keep it under ${MAX_FACT_VALUE} characters.`;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) return "Remove control characters.";
  return null;
}
export const coveragePercent = (c: BCoverage): number | null =>
  c.messagesImported !== null && c.messagesKnownTotal ? Math.min(100, Math.floor(c.messagesImported * 100 / c.messagesKnownTotal)) : null;

/** FIXTURE-ONLY data. Names are labelled so a screenshot can never pass for a real fan. */
export function fixtureAccountCoverage(accountId: string): BAccountCoverage {
  return { coverage: { state: "partial", messagesImported: 4200, messagesKnownTotal: 9000, oldestAt: "2026-03-01T00:00:00Z", newestAt: "2026-10-22T00:00:00Z", memoryBuiltAt: "2026-10-22T06:00:00Z" },
    fansTotal: 3, fansWithMemory: 2, nextCursor: null, fans: [
      { fanId: "9001", displayName: "FIXTURE fan A", coverage: "complete", factCount: 3 },
      { fanId: "9002", displayName: "FIXTURE fan B", coverage: "partial", factCount: 1 },
      { fanId: "9003", displayName: "FIXTURE fan C (no memory)", coverage: "not_started", factCount: 0 }] };
}
export function fixtureFanMemory(accountId: string, fanId: string): BFanMemory | null {
  const cov = (state: CoverageState, imported: number, total: number): BCoverage => ({ state, messagesImported: imported, messagesKnownTotal: total, oldestAt: "2026-03-01T00:00:00Z", newestAt: "2026-10-22T00:00:00Z", memoryBuiltAt: "2026-10-22T06:00:00Z" });
  if (fanId === "9001") return { fanId, displayName: "FIXTURE fan A", revision: 4, coverage: cov("complete", 120, 120),
    summary: { text: "FIXTURE summary: chats most evenings, likes short replies, bought twice.", updatedAt: "2026-10-22T06:00:00Z", source: "inferred" },
    facts: [{ factId: "f1", field: "preferred_name", label: "Preferred name", value: "Alex", source: "history", updatedAt: "2026-10-01T00:00:00Z", editable: true },
      { factId: "f2", field: "timezone", label: "Timezone", value: "US Eastern", source: "operator", updatedAt: "2026-10-05T00:00:00Z", editable: true },
      { factId: "f3", field: "spend_tier", label: "Spend tier", value: "Repeat buyer", source: "inferred", updatedAt: "2026-10-22T00:00:00Z", editable: false }] };
  if (fanId === "9002") return { fanId, displayName: "FIXTURE fan B", revision: 1, coverage: cov("partial", 10, 60), summary: null,
    facts: [{ factId: "g1", field: "preferred_name", label: "Preferred name", value: "Sam", source: "history", updatedAt: null, editable: true }] };
  if (fanId === "9003") return { fanId, displayName: "FIXTURE fan C (no memory)", revision: 0, coverage: cov("not_started", 0, 0), summary: null, facts: [] };
  return null;
}

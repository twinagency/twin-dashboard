/** Moxy's additive configuration contract. Unknown shapes never imply readiness. */
export const MOXY_SCHEMA = "of-configuration.v3";
export type MoxyMode = "off" | "preview" | "on";
export type MoxyDecision = { id: string; fanId: number; kind: string; status: string; reason: string | null;
  decision: Record<string, unknown> | null; intentId: string | null };
export type MoxyView = { engine: "legacy"; moxySelected: false } | {
  engine: "moxy"; moxySelected: true; mode: MoxyMode; revision: number;
  readiness: { ready: boolean; blockers: string[] }; settings: Record<string, unknown>; decisions: MoxyDecision[];
};
export const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const mode = (v: unknown): v is MoxyMode => v === "off" || v === "preview" || v === "on";
const revision = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
export function readiness(v: unknown): v is { ready: boolean; blockers: string[] } {
  return record(v) && typeof v.ready === "boolean" && Array.isArray(v.blockers) &&
    v.blockers.every(x => typeof x === "string") && (!v.ready || v.blockers.length === 0);
}
export function parseMoxy(value: unknown, accountId: string): MoxyView | null {
  if (!record(value) || value.ok !== true || value.schemaVersion !== MOXY_SCHEMA || value.accountId !== accountId || !record(value.moxy)) return null;
  const v = value.moxy;
  if (v.engine === "legacy" && v.moxySelected === false) return { engine: "legacy", moxySelected: false };
  if (v.engine !== "moxy" || v.moxySelected !== true || !mode(v.mode) || !revision(v.revision) ||
      !readiness(v.readiness) || !record(v.settings) || !Array.isArray(v.decisions) || v.decisions.length > 50) return null;
  if (!v.decisions.every(d => record(d) && typeof d.id === "string" && Number.isSafeInteger(d.fanId) && Number(d.fanId) > 0 &&
      typeof d.kind === "string" && typeof d.status === "string" && (d.reason === null || typeof d.reason === "string") &&
      (d.decision === null || record(d.decision)) && (d.intentId === null || typeof d.intentId === "string"))) return null;
  return v as MoxyView;
}
export type MoxyChange = { expectedRevision: number; mode: MoxyMode; settings: Record<string, unknown> };
export function validMoxyChange(v: unknown): v is MoxyChange {
  return record(v) && Object.keys(v).sort().join(",") === "expectedRevision,mode,settings" &&
    revision(v.expectedRevision) && mode(v.mode) && record(v.settings);
}
export function moxyAck(v: unknown, accountId: string, change: MoxyChange): boolean {
  return record(v) && v.ok === true && v.schemaVersion === MOXY_SCHEMA && v.accountId === accountId &&
    record(v.moxy) && v.moxy.mode === change.mode && v.moxy.revision === change.expectedRevision + 1 && readiness(v.moxy.readiness);
}


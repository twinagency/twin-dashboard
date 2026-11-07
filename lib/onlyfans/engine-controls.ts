/** One vocabulary for takeover, hand back and resume, so the composer, the reply controls and the request panel never disagree. */
export type EngineControlAction = "request_takeover" | "release_takeover" | "resume_automation" | "pause_automation";
const ENGINE_LABELS: Record<EngineControlAction, string> = {
  request_takeover: "Take over", release_takeover: "Hand back to engine", resume_automation: "Resume engine replies", pause_automation: "Pause engine replies" };
const PLAIN_LABELS: Record<EngineControlAction, string> = {
  request_takeover: "Take over", release_takeover: "Hand back to AI", resume_automation: "Resume AI", pause_automation: "Pause AI" };
export const ENGINE_CONTROL_ORDER: readonly string[] = ["request_takeover", "release_takeover", "resume_automation", "pause_automation"];
export const isEngineControlAction = (value: string): value is EngineControlAction => ENGINE_CONTROL_ORDER.includes(value);
/** `engineAware` is true when the conversation has an engine status; otherwise the older AI wording stays. */
export const engineControlLabel = (action: EngineControlAction, engineAware: boolean) => (engineAware ? ENGINE_LABELS : PLAIN_LABELS)[action];
/** The label while the command is in flight. */
export function engineControlPendingLabel(action: EngineControlAction): string {
  return action === "request_takeover" ? "Requesting takeover…" : action === "release_takeover" ? "Handing back…" : "Saving…";
}
/** Stable order for the control set: take over, hand back, resume, pause; anything else keeps its place after them. */
export function orderControls<T extends { action: string }>(entries: readonly T[]): T[] {
  const rank = (action: string) => { const index = ENGINE_CONTROL_ORDER.indexOf(action); return index === -1 ? ENGINE_CONTROL_ORDER.length : index; };
  return entries.map((entry, position) => ({ entry, position })).sort((a, b) => rank(a.entry.action) - rank(b.entry.action) || a.position - b.position).map(item => item.entry);
}

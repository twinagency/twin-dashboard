/** Explicit fan selection stays inside the deployment allowlist and never changes conversation modes. */
export type FanSelection = { mode: "single" | "selected" | "all"; fans: number[] };
export type ActivationReadiness = {
  deploymentAllowed: boolean; allFansAllowed: boolean; allowedFans: number[];
  modelCredentialReady: boolean; proxySaved: boolean;
  selection: FanSelection | null; selectionValid: boolean;
  automatedConversations: number; pausedConversations: number; noContactConversations: number;
  takeoverConversations: number; nextSendAt: string | null; throttleSeconds: number | null;
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const fans = (v: unknown): v is number[] => Array.isArray(v) && v.length <= 5000 &&
  v.every(n => Number.isSafeInteger(n) && n > 0) && new Set(v).size === v.length;
export function validFanSelection(v: unknown): v is FanSelection {
  if (!object(v) || Object.keys(v).sort().join() !== "fans,mode" || !fans(v.fans)) return false;
  return v.mode === "all" ? v.fans.length === 0 : v.mode === "single" ? v.fans.length === 1 : v.mode === "selected" && v.fans.length > 0;
}
export function parseActivationReadiness(v: unknown): ActivationReadiness | null {
  if (!object(v) || Object.keys(v).sort().join() !== ["deploymentAllowed", "allFansAllowed", "allowedFans", "selection", "selectionValid", "modelCredentialReady", "proxySaved",
    "automatedConversations", "pausedConversations", "noContactConversations", "takeoverConversations", "nextSendAt", "throttleSeconds"].sort().join() ||
    typeof v.deploymentAllowed !== "boolean" || typeof v.allFansAllowed !== "boolean" || typeof v.selectionValid !== "boolean" || typeof v.modelCredentialReady !== "boolean" || typeof v.proxySaved !== "boolean" || !fans(v.allowedFans) ||
    !(v.selection === null || validFanSelection(v.selection)) ||
    ![v.automatedConversations,v.pausedConversations,v.noContactConversations,v.takeoverConversations].every(n => Number.isSafeInteger(n) && Number(n) >= 0) ||
    !(v.nextSendAt === null || typeof v.nextSendAt === "string" && /Z$/.test(v.nextSendAt) && Number.isFinite(Date.parse(v.nextSendAt))) ||
    !(v.throttleSeconds === null || Number.isInteger(v.throttleSeconds) && Number(v.throttleSeconds) >= 1 && Number(v.throttleSeconds) <= 86400) ||
    v.allFansAllowed && !v.deploymentAllowed || !v.deploymentAllowed && v.allowedFans.length > 0) return null;
  return v as ActivationReadiness;
}
export function fanSelectionFromText(mode: "selected" | "all", text: string): FanSelection | null {
  if (mode === "all") return {mode, fans: []};
  const tokens = text.trim().split(/[\s,]+/);
  if (!tokens.every(t => /^[1-9][0-9]*$/.test(t))) return null;
  const selected = {mode, fans: [...new Set(tokens.map(Number))].sort((a,b) => a-b)};
  return validFanSelection(selected) ? selected : null;
}

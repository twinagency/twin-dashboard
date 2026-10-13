// Only the explicitly designated test account may use this presentation mode.
// Never match by name/email or grant a demo ID access to a real clone.
export const DEMO_CLONE_ID = "demo-zane";
export const ZANE_DEMO_ACCOUNT_ID = "36311e0c-3b1a-4aad-aa97-ed40e32cb31d";
type Access = { id: string; cloneIds: readonly string[]; kind?: unknown; onboarded?: boolean };
export function isZaneDemo(access: Access | null | undefined): boolean {
  return access?.id === `creator:${ZANE_DEMO_ACCOUNT_ID}` && access.kind === "creator" && access.onboarded === true && access.cloneIds.length === 0;
}
export function creatorDemoQueryIds(path: string, access: Access): readonly string[] {
  return access.cloneIds;
}

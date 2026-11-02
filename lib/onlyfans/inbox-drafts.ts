/** Private drafts live only in this document, never on disk or in a shared cache.
 * The server-derived principal includes the agency and staff identity. Full-page
 * logout/reload drops everything; a new operator session has a different key.
 */
import type { VaultItem } from "./vault";
export type InboxDraft = { selectedMedia: VaultItem[]; mediaPaid: boolean; mediaPrice: string; previewIds: string[]; body: string; catalogItemId: string; revision: number; updatedAt: number };
const EMPTY: InboxDraft = { selectedMedia: [], mediaPaid: false, mediaPrice: "3.00", previewIds: [], body: "", catalogItemId: "", revision: 0, updatedAt: 0 };
const drafts = new Map<string, InboxDraft>();
const listeners = new Set<() => void>();
const TTL = 8 * 60 * 60 * 1000;
let revision = 0;
export const draftKey = (principal: string, account: string, conversation: string) => JSON.stringify([principal, account, conversation]);
export function readDraft(key: string, now = Date.now()): InboxDraft {
  const draft = drafts.get(key);
  return draft && now - draft.updatedAt < TTL ? draft : EMPTY;
}
export const emptyDraft = () => EMPTY;
export function subscribeDraft(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function writeDraft(key: string, patch: Partial<Pick<InboxDraft, "body" | "catalogItemId" | "selectedMedia" | "mediaPaid" | "mediaPrice" | "previewIds">>, now = Date.now()) {
  for (const [id, draft] of drafts) if (now - draft.updatedAt >= TTL) drafts.delete(id);
  const next = { ...readDraft(key, now), ...patch, updatedAt: now, revision: ++revision };
  drafts.set(key, next);
  listeners.forEach(listener => listener());
  return next;
}
/** Clear the frozen submission, never edits made while its request was pending. */
export function clearSubmittedDraft(key: string, submitted: InboxDraft) {
  if (drafts.get(key)?.revision !== submitted.revision) return false;
  drafts.delete(key); listeners.forEach(listener => listener()); return true;
}
export function clearDrafts() { drafts.clear(); listeners.forEach(listener => listener()); }

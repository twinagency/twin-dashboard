/** FIXTURE-ONLY sample data. Shown only after an explicit operator click, always labelled, never reported as connected.
 * Readiness mirrors the read-only facts recorded on 2026-10-23 so the blockers are honest, but this is NOT a live read. */
import type { PersonalitySettings, Purchases, Readiness, Screen } from "./a-types";

const AS_OF = "2026-10-23T05:00:00Z";
export const FIXTURES: { readiness: Readiness; purchases: Purchases; personality: PersonalitySettings } = {
  readiness: { asOf: AS_OF, blockers: [
    { id: "connection", area: "Connection", status: "warn", title: "Provider connection verified, expires soon", detail: "Verified at revision 2. The session expires about 11:15 UTC on 23 Oct. Reconnect before then.", evidence: "connection revision 2", action: { label: "Open connections", kind: "link", href: "/onlyfans/settings" } },
    { id: "history", area: "History recovery", status: "blocked", title: "History recovery is incomplete", detail: "Chats stay paused until recovery completes. Memory and ownership cannot be trusted before then. Recovery is run by the history service, not from this screen.", evidence: null, action: null },
    { id: "ledger", area: "Purchase sync", status: "blocked", title: "Purchase ledger scan is held", detail: "Held at offset 40 with error unsupported_ledger_response. OnlyFans returned rows outside the requested 90-day window and the parser refused the whole page. 52 ownership rows applied, 0 messages marked paid.", evidence: "ledger scan state", action: { label: "Review purchases", kind: "command", command: "purchases" } },
    { id: "ai", area: "AI configuration", status: "blocked", title: "Persona, model and sales configuration incomplete", detail: "From the 23 Oct audit. Recheck on the personality screen, which reads the live configuration.", evidence: null, action: { label: "Open personality and AI", kind: "command", command: "personality" } },
    { id: "catalogue", area: "Catalogue", status: "blocked", title: "0 catalogue items, 1,064 vault items", detail: "Nothing is priced for sale yet. Import offers or create items.", evidence: null, action: { label: "Open content", kind: "link", href: "/onlyfans/content" } },
    { id: "outgoing", area: "Outgoing permissions", status: "blocked", title: "Outgoing authority is disabled", detail: "About 351k priced outgoing messages exist in history. No live send is authorised from this dashboard.", evidence: null, action: null },
    { id: "upload", area: "CRM to OnlyFans upload", status: "blocked", title: "No verified unpublished upload path", detail: "Blocked by design until a safe path is verified.", evidence: null, action: null },
    { id: "paid-read", area: "Paid-post reading", status: "unknown", title: "Paid-post reading is not verified", detail: "Reported as Unsupported. Ownership from paid posts cannot be inferred.", evidence: null, action: null },
  ] },
  purchases: { scan: { state: "held", offset: 40, error: "unsupported_ledger_response", appliedOwnershipRows: 52, messagesMarkedPaid: 0 }, nextCursor: null, items: [
    { id: "p-1", kind: "failed_import", status: "open", revision: 3, fanId: "501", messageId: "1001", amountCents: 1999, currency: "USD", reason: "Ledger row outside the requested window", evidence: [{ id: "e-1", source: "ledger page", ref: "offset 40, row 3", observedAt: AS_OF }], audit: [] },
    { id: "p-2", kind: "unmatched", status: "open", revision: 1, fanId: null, messageId: null, amountCents: 2500, currency: "USD", reason: "No message matches this payment", evidence: [], audit: [] },
    { id: "p-3", kind: "reversal", status: "resolved", revision: 4, fanId: "502", messageId: "1002", amountCents: 1500, currency: "USD", reason: "Provider reversed the payment", evidence: [{ id: "e-3", source: "ledger page", ref: "offset 12, row 1", observedAt: AS_OF }],
      audit: [{ at: AS_OF, actor: "operator", resolution: "not_owned", reason: "Reversal confirmed on the ledger row", evidenceId: "e-3" }] },
  ] },
  personality: { configApproved: false, configRevision: 2, model: "example/model", dailyBudgetCents: 500, behaviour: { maxRepliesPerHour: 30, allowSales: false }, drafts: [
    { id: "d-1", revision: 1, field: "Persona", imported: "Warm, playful, replies in short lines.", edited: null, source: "imported chat style", approved: false },
    { id: "d-2", revision: 1, field: "Boundaries", imported: "No meetups. No real contact details.", edited: null, source: "imported chat style", approved: false },
  ] },
};
export const fixtureFor = <S extends Screen>(screen: S) => FIXTURES[screen];

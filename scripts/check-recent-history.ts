import assert from "node:assert/strict";
import { parseRecentHistory } from "../lib/onlyfans-connections/recent-history";
import { parseConnection } from "../lib/onlyfans-connections/contract";
const recent = { schemaVersion: "of-recent-history.v1", startedAt: "2026-11-02T03:00:00Z", cutoffAt: "2026-10-03T03:00:00Z",
  initialHistory: { state: "recent_history_ready", discoveryComplete: true, conversationsDiscovered: 2, conversationsReady: 2, conversationsAwaitingWork: 0,
    messagesSavedInWindow: 12, fansWithStoredWindowMessages: 2, providerErrors: {}, discoveryError: null, providerRequests: 8, failedReadAttempts: 0,
    unfinishedReadAttempts: 0, providerOrdering: "id_desc_exhaustive_date_filter", elapsedSeconds: 42 },
  memoryProcessing: { state: "ready", incomingMessagesInWindow: 7, messagesProcessed: 7, messagesAwaitingProcessing: 0, errors: 0, budgetHold: null },
  olderHistory: { activatedFanJobs: 1, completedFanJobs: 0, pendingFanJobs: 1 }, lifetimeHistory: { complete: false, conversationsComplete: 0 },
  memoryModelAccounting: { providerReportedUsd: "0.004", tokenEstimateUsd: "0", activeReservationUsd: "0.01", unresolvedReservationUsd: "0.02" },
  percentComplete: null, lifetimeTotalMessages: null };
assert(parseRecentHistory(recent));
for (const patch of [{ percentComplete: 100 }, { lifetimeTotalMessages: 0 }, { initialHistory: {...recent.initialHistory, conversationsAwaitingWork: 1} },
  { initialHistory: {...recent.initialHistory, discoveryComplete: false} }, { initialHistory: {...recent.initialHistory, providerErrors: { invalid_page: 1 }} },
  { memoryProcessing: {...recent.memoryProcessing, budgetHold: "profile-budget-exhausted"} },
  { memoryModelAccounting: {...recent.memoryModelAccounting, providerReportedUsd: "NaN"} }]) assert.equal(parseRecentHistory({...recent,...patch}),null);
const connection = { accountId:"of-1",revision:1,status:"verified",ownerId:"1",expiresAt:"2026-11-03T03:00:00Z",verifiedAt:"2026-11-02T03:00:00Z",lastError:null,
  outgoingEnabled:false,policyRevision:1,usedUnits:0,limitUnits:100,mediaEnabled:false,automateNewConversations:false };
const response = (c: object) => ({ schemaVersion:"of-connections.v1",ok:true,connection:c });
assert(parseConnection(response(connection),"of-1"),"Older backend still parses");
assert(parseConnection(response({...connection,recentHistory:recent}),"of-1"),"Recent readiness and incomplete lifetime coexist");
// TEST-CHANGE: F4, an invalid optional diagnostic no longer nulls the connection
const dropped = parseConnection(response({...connection,recentHistory:{...recent,percentComplete:95}}),"of-1");
assert(dropped,"Invalid recentHistory keeps the connection"); assert.equal(dropped.recentHistory,undefined);
assert.equal(parseConnection(response({...connection,unrecognized:true}),"of-1"),null,"Unknown fields remain refused");
console.log("Recent history contract: 13 checks passed");

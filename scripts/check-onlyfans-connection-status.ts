import assert from "node:assert/strict";
import { connectionState, connectionSyncLabel } from "../lib/onlyfans-connections/presentation";
import { parseConnection, parseConnectionSync, CONNECTION_SCHEMA, type Connection, type ConnectionSync } from "../lib/onlyfans-connections/contract";
import { platformConnectionState } from "../lib/creator-platforms/model";
const now=Date.parse("2026-10-22T00:00:00Z");
const c:Connection={accountId:"of-123",revision:2,status:"verified",ownerId:"123",expiresAt:new Date(now+60000).toISOString(),
  verifiedAt:new Date(now-60000).toISOString(),lastError:null,outgoingEnabled:false,policyRevision:0,usedUnits:0,limitUnits:0,mediaEnabled:false,automateNewConversations:false};
assert.equal(connectionState(c,now),"connected");
for(const status of ["verified","expired"] as const){
  const saved={...c,status,expiresAt:new Date(now-1000).toISOString()};
  assert.equal(connectionState(saved,now),"checking");
  assert.equal(connectionState({...saved,lastError:"provider_connection_check_retry"},now),"retrying");
  assert.equal(platformConnectionState({id:c.accountId,handle:"fixture",health:"paused",connection:{...saved,lastError:"provider_connection_check_retry"}},now),"retrying");
}
assert.equal(connectionState({...c,lastError:"provider_connection_check_retry"},now),"retrying");
assert.equal(connectionState({...c,status:"pending",verifiedAt:null,lastError:"provider_connection_check_retry"},now),"retrying");
assert.equal(connectionState({...c,status:"pending",verifiedAt:null,lastError:"provider_connection_check_retry",expiresAt:new Date(now-1).toISOString()},now),"reconnect");
assert.equal(connectionState({...c,status:"failed",lastError:"provider_authentication_required"},now),"reconnect");
assert.equal(connectionState({...c,lastError:"stored_credentials_unavailable"},now),"attention");
assert.equal(connectionState({...c,status:"failed",lastError:"provider_verification_failed"},now),"attention");
assert.equal(connectionState({...c,status:"paused",expiresAt:new Date(now-1).toISOString()},now),"paused");
assert.equal(connectionState(null,now),"unavailable");
const sync:ConnectionSync={discoveryStatus:"complete",pages:5,conversationsComplete:20,conversationsRemaining:0,pendingMessages:0,
  quarantinedMessages:0,recoveryRequired:false,lastCompleteSyncAt:new Date(now-1000).toISOString()};
assert(parseConnectionSync(sync));
assert.equal(connectionSyncLabel(sync,"connected"),"Last import complete");
assert.equal(connectionSyncLabel({...sync,lastCompleteSyncAt:null},"connected"),"Importing history","Pages alone are not completed import");
assert.equal(connectionSyncLabel({...sync,conversationsRemaining:1},"connected"),"Importing history");
assert.equal(connectionSyncLabel({...sync,recoveryRequired:true},"connected"),"Importing history");
assert.equal(connectionSyncLabel(sync,"retrying"),"Waiting for connection");
assert.equal(connectionSyncLabel(sync,"paused"),"Import paused");
assert.equal(connectionSyncLabel({...sync,quarantinedMessages:1},"connected"),"Import needs review");
const read={schemaVersion:CONNECTION_SCHEMA,ok:true,connection:c};
assert(parseConnection(read,c.accountId),"Old backend remains compatible");
assert(parseConnection({...read,connection:{...c,sync}},c.accountId));
for(const changed of [{pages:-1},{pendingMessages:1.5},{lastCompleteSyncAt:"invalid"},{extra:"secret"},{discoveryStatus:"invented"}]){
  assert.equal(parseConnection({...read,connection:{...c,sync:{...sync,...changed}}},c.accountId),null);
}
console.log("PASS connection status: renewable deadlines, transient failures, rejected authentication, paused accounts, opt-in progress compatibility and no premature import completion");

for (const throttleSeconds of [null, 1, 20, 86400]) assert(parseConnection({...read, connection:{...c, throttleSeconds}}, c.accountId));
for (const throttleSeconds of [0, -1, 1.5, 86401, "20", undefined]) assert.equal(parseConnection({...read, connection:{...c, throttleSeconds}}, c.accountId), null);

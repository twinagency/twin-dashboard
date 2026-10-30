import assert from "node:assert/strict";
import { enableExistingFanChats, disableExistingFanChats, type BulkProgress, type BulkOptions } from "../lib/onlyfans/bulk-ai";
import { validBulkRequest, parseBulkAck, type BulkRequest } from "../lib/onlyfans/bulk-controls";
import { createBulkControlBackend } from "../lib/onlyfans/bulk-controls-backend";
import type { ConversationSummary } from "../lib/onlyfans-preview/types";
const accountId = "acc-a", key = "a".repeat(64);
const row = (id: number, mode = "paused", revision = 7, takeover = "none") => ({ accountId, conversationId: `acc-a:${id}`, automationMode: mode, revision, takeoverState: takeover }) as ConversationSummary;
const ack = (request: BulkRequest) => ({ schemaVersion: "of-controls.v1", ok: true, accountId, action: request.action, commandKey: key,
  results: request.items.map(item => ({ conversationId: item.conversationId, outcome: "recorded", recordedRevision: item.expectedRevision + 1 })) });
async function main() {
  let rows = Array.from({ length: 105 }, (_, i) => row(i+1));
  rows.push(row(106,"human_controlled",3,"effective"),row(107,"no_contact"),row(108,"automated"),row(109,"paused",4,"requested"));
  let calls: BulkRequest[] = [], updates: BulkProgress[] = [], aiOnly: boolean[] = [], fail = false, foreign = false, stop = false, skips = false;
  const options: BulkOptions = { account: { accountId } as BulkOptions["account"], viewer: { canManage: true } as BulkOptions["viewer"],
    source: { kind: "live", async listConversations(_account: string, cursor: string | null, only: boolean) {
      aiOnly.push(only); const start = cursor ? Number(cursor) : 0;
      const items = rows.slice(start,start+40).map(r => foreign && start > 0 ? { ...r, accountId: "foreign" } : r);
      return { status:"ready", data:{items,nextCursor:start+40 < rows.length ? String(start+40) : null} };
    }, async getConversation() { throw Error("Bulk must not load every full conversation"); }, async submitCommand() { throw Error("Bulk must use bounded server batches"); }
    } as unknown as BulkOptions["source"], cancelled: () => stop, progress: p => updates.push(p),
    submitBatch: async request => { calls.push(request); if (fail) return {}; const result:any=ack(request);
      if(skips) result.results[0]={conversationId:request.items[0].conversationId,outcome:"skipped",reason:"revision_changed"}; return result; } };
  let result = await enableExistingFanChats(options);
  assert.equal(result.enabled,105); assert.equal(result.protected,3); assert.equal(result.alreadyOn,1);
  assert.deepEqual(calls.map(c=>c.items.length),[50,50,5]); assert(calls.every(c=>c.items.every(i=>i.expectedRevision===7)));
  assert(updates.some(p=>p.phase==="discovering" && p.discovered===40)); assert(aiOnly.every(v=>v===false));
  calls=[]; skips=true; result=await enableExistingFanChats(options); assert.equal(result.enabled,102);assert.equal(result.reasons.revision_changed,3);
  calls=[]; skips=false; fail=true; await assert.rejects(enableExistingFanChats(options),/not fully confirmed/);assert.equal(calls.length,1);
  calls=[]; fail=false; foreign=true;await assert.rejects(enableExistingFanChats(options),/changed account/);assert.equal(calls.length,0);foreign=false;
  stop=true;await assert.rejects(enableExistingFanChats(options),/Stopped/);stop=false;
  await assert.rejects(enableExistingFanChats({...options,viewer:{...options.viewer,canManage:false}}),/cannot change/);
  await assert.rejects(enableExistingFanChats({...options,source:{...options.source,kind:"fixture"} as any}),/cannot change/);
  calls=[];aiOnly=[];rows=[row(1,"automated",8),row(2,"automated",9,"effective"),row(3,"paused",4),row(4,"no_contact",2)];
  result=await disableExistingFanChats(options);assert.equal(result.disabled,1);assert.equal(result.alreadyOff,1);assert.equal(result.protected,2);
  assert.equal(calls[0].action,"pause_automation");assert(aiOnly.every(Boolean));
  rows=Array.from({length:100},(_,i)=>row(i+1));calls=[];
  await assert.rejects(enableExistingFanChats({...options,submitBatch:async r=>{calls.push(r);stop=true;return ack(r)}}),/Stopped/);
  assert.equal(calls.length,1);stop=false;
  const request:BulkRequest={action:"resume_automation",items:[{conversationId:"acc-a:1",expectedRevision:7}]};
  assert(validBulkRequest(request));
  for(const invalid of [{...request,action:[]},{...request,items:[]},{...request,items:Array(51).fill(request.items[0])},
    {...request,items:[...request.items,...request.items]},{...request,items:[{...request.items[0],expectedRevision:true}]},{...request,actor:"injected"}]) assert(!validBulkRequest(invalid));
  const expected={...request,accountId,commandKey:key}, good=ack(request);
  assert(parseBulkAck(good,expected));
  for(const bad of [{...good,accountId:"other"},{...good,commandKey:"b".repeat(64)},{...good,results:[]},
    {...good,results:[{...good.results[0],recordedRevision:9}]},{...good,results:[{conversationId:"acc-a:1",outcome:"skipped",reason:"unknown"}]}]) assert.equal(parseBulkAck(bad,expected),null);
  let received:RequestInit|undefined, url="";
  const backend=createBulkControlBackend({baseUrl:"https://synthetic.invalid/",token:"synthetic-only",fetchImpl:async (input,init)=>{
    url=String(input);received=init;return new Response(JSON.stringify(good),{status:200}); }});
  assert((await backend({...expected,actor:"op-session:"+key})).ok);
  assert.match(url,/accounts\/acc-a\/bulk-conversations$/);assert.equal(new Headers(received?.headers).get("authorization"),"Bearer synthetic-only");
  for(const transport of [async()=>{throw Error("lost response")},async()=>new Response("{}",{status:409}),async()=>new Response(JSON.stringify({...good,accountId:"other"}))]) {
    const response=await createBulkControlBackend({baseUrl:"https://synthetic.invalid",token:"synthetic-only",fetchImpl:transport})( {...expected,actor:"op-session:"+key});
    assert(!response.ok);if(!response.ok)assert.equal(response.outcome,"unconfirmed");
  }
  console.log("PASS bulk AI: bounded batches, both directions, nonzero revisions, progress, skips, partial uncertainty, cancellation, isolation, authority and proxy acknowledgements.");
}
main().catch(error=>{console.error(error);process.exitCode=1});

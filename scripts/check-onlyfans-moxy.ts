import assert from 'node:assert/strict';
import { parseMoxy, validMoxyChange, moxyAck, MOXY_SCHEMA } from '../lib/onlyfans/moxy';
import { createMoxyBackend } from '../lib/onlyfans/moxy-backend';

async function main() {
  const current = { ok:true, schemaVersion:MOXY_SCHEMA, accountId:'fixture-a', moxy:{ engine:'moxy',moxySelected:true,mode:'off',revision:1,
    settings:{creator_key:'synthetic'},readiness:{ready:false,blockers:['inventory_missing']},decisions:[] } };
  assert(parseMoxy(current,'fixture-a'));
  assert.equal(parseMoxy(current,'fixture-b'),null);
  assert.equal(parseMoxy({...current,schemaVersion:'of-configuration.v2'},'fixture-a'),null);
  assert.equal(parseMoxy({...current,moxy:{...current.moxy,readiness:{ready:true,blockers:['missing']}}},'fixture-a'),null);
  const change={expectedRevision:1,mode:'off' as const,settings:{creator_key:'synthetic'}};
  assert(validMoxyChange(change));
  for(const invalid of [{...change,actor:'forged'},{...change,expectedRevision:true},{...change,mode:'legacy'},{...change,settings:[]}]) assert(!validMoxyChange(invalid));
  const ack={...current,moxy:{mode:'off',revision:2,readiness:current.moxy.readiness}};
  assert(moxyAck(ack,'fixture-a',change));assert(!moxyAck(ack,'fixture-b',change));assert(!moxyAck(ack,'fixture-a',{...change,expectedRevision:2}));
  let count=0;
  const backend=createMoxyBackend({baseUrl:'https://fixture.invalid/',token:'synthetic-config',fetchImpl:async(url,init)=>{
    count++; assert.equal(String(url),'https://fixture.invalid/onlyfans/configuration/v1/accounts/fixture-a/moxy');
    assert.equal(init?.method,'PUT');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
    assert.deepEqual(JSON.parse(String(init?.body)),{...change,actor:'verified-session'});
    return Response.json(ack);
  }});
  assert((await backend.save('fixture-a',change,'verified-session')).ok);assert.equal(count,1);
  for(const outcome of ['lost','malformed','scope','conflict']) {
    let calls=0;
    const b=createMoxyBackend({baseUrl:'https://fixture.invalid',token:'synthetic',fetchImpl:async()=>{
      calls++;if(outcome==='lost') throw Error('response lost');
      if(outcome==='malformed')return new Response('invalid');
      if(outcome==='scope')return Response.json({...ack,accountId:'fixture-b'});
      return Response.json({error:'moxy_revision_conflict'},{status:409});
    }});
    const saved=await b.save('fixture-a',change,'verified-session');assert(!saved.ok);
    assert.equal(saved.status,outcome==='conflict'?409:502);assert.equal(calls,1);
  }
  console.log('PASS Moxy contract: account/schema guards, revision, actor boundary, single-attempt saves, uncertain outcomes');
}
main().catch(e=>{console.error(e);process.exitCode=1});

import assert from 'node:assert/strict';
import { explainReason, needsSupply, REASON_TEXT, parseMoxy, validMoxyChange, moxyAck, MOXY_SCHEMA } from '../lib/onlyfans/moxy';
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
  const withCustoms={...current,moxy:{...current.moxy,customs:[{fanId:7,id:'c1',stage:'quoted',owner:'op',quoteCents:5000,deadline:null,overdue:false,waitingOn:'awaiting_fan_payment;deadline_unset'}]}};
  const parsed=parseMoxy(withCustoms,'fixture-a');assert(parsed&&parsed.engine==='moxy'&&parsed.customs.length===1);
  const noCustoms=parseMoxy(current,'fixture-a');assert(noCustoms&&noCustoms.engine==='moxy'&&noCustoms.customs.length===0);
  assert.equal(parseMoxy({...withCustoms,moxy:{...withCustoms.moxy,customs:[{fanId:7}]}},'fixture-a'),null);
  for(const code of ['talker_timing_unresolved','creator_reply_gap_setting','moxy_owner_lookup_failed','moxy_canonical_owner_required','campaign_provider_recovery_required','graveyard_shift_unknown']) assert(REASON_TEXT[code],code);
  assert.notEqual(explainReason('moxy_activation_not_ready:a,b'),'moxy_activation_not_ready:a,b');
  assert.equal(explainReason('brand_new_code'),'brand_new_code');
  assert(explainReason('operational_field_missing:rate').includes('rate'));
  assert(needsSupply('talker_timing_unresolved')&&needsSupply('operational_field_missing:x')&&!needsSupply('moxy_off'));
  let count=0;
  const backend=createMoxyBackend({baseUrl:'https://fixture.invalid/',token:'synthetic-config',fetchImpl:async(url,init)=>{
    count++; assert.equal(String(url),'https://fixture.invalid/onlyfans/configuration/v1/accounts/fixture-a/moxy');
    assert.equal(init?.method,'PUT');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
    assert.deepEqual(JSON.parse(String(init?.body)),{...change,actor:'verified-session'});
    return Response.json(ack);
  }});
  assert((await backend.save('fixture-a',change,'verified-session')).ok);assert.equal(count,1);
  for(const outcome of ['lost','malformed','scope','unavailable','conflict']) {
    let calls=0;
    const b=createMoxyBackend({baseUrl:'https://fixture.invalid',token:'synthetic',fetchImpl:async()=>{
      calls++;if(outcome==='lost') throw Error('response lost');
      if(outcome==='malformed')return new Response('invalid');
      if(outcome==='scope')return Response.json({...ack,accountId:'fixture-b'});
      if(outcome==='unavailable')return Response.json({error:'service_unavailable'},{status:503});
      return Response.json({error:'moxy_revision_conflict'},{status:409});
    }});
    const saved=await b.save('fixture-a',change,'verified-session');assert(!saved.ok);
    assert.equal(saved.status,outcome==='conflict'?409:502);assert.equal(calls,1);
  }
  console.log('PASS Moxy contract: account/schema guards, revision, actor boundary, single-attempt saves, uncertain outcomes');
}
main().catch(e=>{console.error(e);process.exitCode=1});

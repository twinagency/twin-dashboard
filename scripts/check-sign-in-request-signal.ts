import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {signInRequestSignal} from '../lib/onlyfans-sign-in/request-signal';
async function main(){
  const originalAny=AbortSignal.any,originalTimeout=AbortSignal.timeout;
  Object.defineProperty(AbortSignal,'any',{value:undefined,configurable:true});
  Object.defineProperty(AbortSignal,'timeout',{value:undefined,configurable:true});
  try{
    const first=new AbortController(),second=new AbortController(),reason=new Error('frame replaced');
    const combined=signInRequestSignal(5000,[first.signal,second.signal]);
    assert.equal(combined.signal.aborted,false);
    assert.equal(getEventListeners(first.signal,'abort').length,1);
    second.abort(reason);
    assert.equal(combined.signal.aborted,true);assert.equal(combined.signal.reason,reason);
    assert.equal(getEventListeners(first.signal,'abort').length,0);
    assert.equal(getEventListeners(second.signal,'abort').length,0);
    combined.dispose();
    const cancelled=new AbortController();cancelled.abort(reason);
    const preCancelled=signInRequestSignal(5000,[first.signal,cancelled.signal]);
    assert.equal(preCancelled.signal.aborted,true);assert.equal(preCancelled.signal.reason,reason);
    assert.equal(getEventListeners(first.signal,'abort').length,0);
    const timeout=signInRequestSignal(10);await delay(30);
    assert.equal(timeout.signal.aborted,true);assert.equal(timeout.signal.reason.name,'TimeoutError');
    const completed=signInRequestSignal(10,[first.signal]);completed.dispose();completed.dispose();await delay(30);
    assert.equal(completed.signal.aborted,false);assert.equal(getEventListeners(first.signal,'abort').length,0);
    console.log('PASS sign-in request lifecycle: legacy APIs absent, source cancellation, already cancelled source, deadline and timer/listener cleanup.');
  }finally{
    Object.defineProperty(AbortSignal,'any',{value:originalAny,configurable:true});
    Object.defineProperty(AbortSignal,'timeout',{value:originalTimeout,configurable:true});
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});

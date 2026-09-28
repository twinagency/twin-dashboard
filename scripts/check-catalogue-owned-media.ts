import assert from 'node:assert/strict';
import { OwnedMediaCache } from '../lib/catalogue-owned-media';

const images:ImageFixture[]=[];
class ImageFixture {
  complete=false;naturalWidth=0;naturalHeight=0;src='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
  constructor(){images.push(this);}
  loaded(){this.complete=true;this.naturalWidth=480;this.naturalHeight=640;this.onload?.();}
}
(globalThis as any).Image=ImageFixture;
(globalThis as any).fetch=async()=>({ok:true,blob:async()=>new Blob(['private photo bytes'],{type:'image/jpeg'})});
async function main(){
  const cache=new OwnedMediaCache();let ready=false;
  const load=cache.prepare('photo:a',{type:'photo',url:'signed:a'}).then(value=>{ready=true;return value;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(ready,false,'An API URL is not a loaded photo');
  assert.equal(cache.get('photo:a'),undefined,'No blank image enters the cache');
  images[0].loaded();const media=await load;
  assert.equal(media.type,'photo');assert.equal(media.width,480);assert.equal(media.height,640);assert.match(media.url,/^blob:/,'The downloaded photo is retained, not just a network URL');
  assert.equal(cache.get('photo:a'),media,'Reopening retains the successfully loaded original');
  const broken=cache.prepare('photo:b',{type:'photo',url:'signed:broken'});
  const rejection=assert.rejects(broken,/Could not load/);await new Promise(resolve=>setImmediate(resolve));images[1].onerror?.();await rejection;
  assert.equal(cache.get('photo:b'),undefined,'Failed originals must not poison subsequent retries');
  cache.retain(new Set());assert.equal(cache.get('photo:a'),undefined,'Revoked ownership clears session cache');
  await cache.prepare('video:a',{type:'video',url:'signed:video'});
  const now=Date.now;Date.now=()=>now()+241_000;
  try{assert.equal(cache.get('video:a'),undefined,'Expired signatures are refreshed');}finally{Date.now=now;}
  console.log('Owned media: waits for actual image load, preserves a decoded original on reopen, retries failed images, and clears expired or revoked access.');
}
main().catch(error=>{console.error(error);process.exitCode=1});

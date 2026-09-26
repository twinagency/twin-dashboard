import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openCatalogueChat } from '../lib/catalogue-navigation';
const chat='https://t.me/test_creator';
const events:string[]=[];
let deferred:(()=>void)|undefined;
let navigationProcessed=false;
const telegram={initData:'signed-session',openTelegramLink:(url:string)=>{assert.equal(url,chat);events.push('open');},close:()=>{assert.equal(navigationProcessed,true,'closing in the same turn cancels the mobile handoff');events.push('close');}};
openCatalogueChat(chat,telegram,()=>{throw Error('must use Telegram bridge');},(callback,delay)=>{assert.ok(delay>=300);deferred=callback;});
assert.deepEqual(events,['open'],'must not immediately close the native webview');
navigationProcessed=true;deferred!();assert.deepEqual(events,['open','close']);
let fallback='';deferred=undefined;
openCatalogueChat(chat,{...telegram,openTelegramLink:()=>{throw Error('bridge unavailable');}},url=>{fallback=url;},callback=>{deferred=callback;});
assert.equal(fallback,chat,'bridge failure has a real link fallback');assert.ok(deferred);
fallback='';openCatalogueChat(chat,undefined,url=>{fallback=url;},()=>{throw Error('no timer in browser');});assert.equal(fallback,chat);
let closed=false;openCatalogueChat(null,{...telegram,close:()=>{closed=true;}},()=>{},()=>{});assert.equal(closed,true);
// Verify the tested runtime function is wired to both the back button and the
// confirmed-delivery branch, and a second tap opens the delivered item.
const component=readFileSync(new URL('../app/catalogue/[slug]/Catalogue.tsx',import.meta.url),'utf8');
assert.match(component,/function backToChat\(\)\s*\{\s*openCatalogueChat/);
assert.match(component,/if \(result.status === "delivered"\)\s*\{[\s\S]*?setDelivered[\s\S]*?backToChat\(\)/);
assert.match(component,/item\.received \|\| item\.purchased \|\| delivered\.has/);
assert.match(component,/Open payment in chat/);
assert.doesNotMatch(component,/openTelegramLink\(data.chatUrl\); app\(\)!\.close\(\)/);
console.log('Catalogue navigation passed: deferred mobile handoff, browser/bridge fallback, confirmed delivery and repeat-tap wiring');

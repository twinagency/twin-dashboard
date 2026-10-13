// Read-only snapshot. No model, Telegram, storage-download or database-write calls.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {config} from './src/config.ts';
import {loadRawCatalogue} from './src/media.ts';
import {fetchBundleRows} from './src/bundles.ts';
import {TIP_SETTING_COLUMNS} from './src/tips/settings.ts';
const headers={apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey};
const cols='id,slug,name,engine,status,v2_vars,v2_memory_enabled,v2_credits_enabled,v2_credits_pack_quantity,v2_credits_pack_stars,v2_credits_revision,'+TIP_SETTING_COLUMNS;
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?select='+cols+'&status=eq.active&order=slug',{headers,signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('active profiles snapshot failed '+r.status);
const profiles=await r.json(),catalogues={},bundles={},errors={};
for(const p of profiles){
 try{catalogues[p.id]=await loadRawCatalogue(p.id);bundles[p.id]=await fetchBundleRows(p.id);}
 catch(e){errors[p.slug]=String(e.message).slice(0,160);}
}
const files=['src/media.ts','src/turn.ts','src/grounding.ts','src/girls/template.ts','src/runner.ts','src/deliver.ts','src/memory.ts','src/config.ts','scripts/lib/turn-rig.ts'];
const sourceHashes=Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
console.log('FLEET_FIXTURE_JSON '+JSON.stringify({at:new Date().toISOString(),runtime:process.env.GIT_SHA,profiles,catalogues,bundles,errors,sourceHashes,model:{model:config.model,providers:config.providerOrder,maxTokens:config.maxTokens,historyLimit:config.historyLimit}}));

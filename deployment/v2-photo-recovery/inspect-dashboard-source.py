"""Read-only source comparison for the separately rebuilt dashboard; no model or data calls."""
import json,subprocess
js=r"""
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const hashes={};
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.isFile())hashes[p.replace(/^\/app\//,'')]=createHash('sha256').update(fs.readFileSync(p)).digest('hex');}}
for(const dir of ['/app/src','/app/dashboard','/app/scripts'])if(fs.existsSync(dir))walk(dir);
for(const p of ['/app/package.json','/app/package-lock.json'])if(fs.existsSync(p))hashes[p.replace(/^\/app\//,'')]=createHash('sha256').update(fs.readFileSync(p)).digest('hex');
console.log(JSON.stringify(hashes));
"""
all={}
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 all[name]=json.loads(subprocess.check_output(['docker','exec',name,'node','--input-type=module','-e',js],text=True))
a,b=all.values()
expected=json.loads("{\"dashboard/history.ts\":\"86a02531c08601e1e62e682ee2111f6738826f1e5f7a4dbda90ebdeb2039286c\",\"dashboard/history-client.js\":\"49d2a43438830ff9d484c1ee7cbd8b6904680b5cfb56557f8ebca14941a7481d\",\"scripts/check-dashboard-history.ts\":\"7df5df76de7db5af12191a1e22bf36522ea7d024e3174f6f73671528253fc91e\"}")
diffs=[{'path':p,'botHash':a.get(p),'dashboardHash':b.get(p),'matchesReviewedHistory':b.get(p)==expected.get(p)} for p in sorted(set(a)|set(b)) if a.get(p)!=b.get(p)]
print(json.dumps({'status':'READ ONLY DASHBOARD SOURCE COMPARISON','filesCompared':len(set(a)|set(b)),'differences':diffs,'expectedHistoryHashes':expected,'modelCalls':0,'productionWrites':0}))

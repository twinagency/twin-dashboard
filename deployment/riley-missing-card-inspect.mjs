import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';import {girlLogDir,girlDataDir} from './src/context.ts';
const slug='riley-mae-lewis';const records=[];
for await(const line of readline.createInterface({input:fs.createReadStream(path.join(girlLogDir(slug),'requests.jsonl')),crlfDelay:Infinity})){
let r;try{r=JSON.parse(line)}catch{continue}
if(String(r.chatId)==='6814483810'&&r.ts>='2026-10-12T10:15:00Z')records.push(r);
}
console.log(JSON.stringify({runtime:process.env.GIT_SHA,rows:records.length,records:records.slice(-12).map(r=>({ts:r.ts,turnId:r.turnId,fanText:r.fanText,raw:r.raw,note:r.note,mode:r.mode,route:r.route,selectedMedia:r.selectedMedia,media:r.media,delivery:r.delivery,menu:r.menu,grounding:r.grounding,historyNotes:r.history?.filter(m=>/\\[(?:locked|sent him|he unlocked|delivery)/i.test(m.content)).slice(-6),promptMedia:r.system?.match(/YOUR CONTENT[\\s\\S]*?(?=TELEGRAM STARS|$)/)?.[0]}))}));

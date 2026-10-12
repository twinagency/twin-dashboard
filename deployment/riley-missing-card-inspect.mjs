import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';import {girlLogDir} from './src/context.ts';
const records=[],delivered=[];let first=null;
for await(const line of readline.createInterface({input:fs.createReadStream(path.join(girlLogDir('riley-mae-lewis'),'requests.jsonl')),crlfDelay:Infinity})){
let r;try{r=JSON.parse(line)}catch{continue}if(String(r.chatId)!=='6814483810')continue;
first??=r.ts;
if(r.media)delivered.push({ts:r.ts,fanText:r.fanText,media:r.media,attempt:r.delivery?.media});
if(r.ts>='2026-10-12T09:00:00Z'&&r.ts<'2026-10-12T10:15:00Z')records.push({ts:r.ts,fanText:r.fanText,raw:r.raw,selectedMedia:r.selectedMedia,media:r.media,delivery:r.delivery});
}
console.log(JSON.stringify({first,delivered:delivered.slice(-20),recent:records.slice(-20)}));
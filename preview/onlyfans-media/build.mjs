import {build} from 'esbuild';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const root=path.resolve(import.meta.dirname,'../..');const out=process.env.ONLYFANS_UI_OUTPUT||path.join(root,'preview/onlyfans-media/dist');await mkdir(out,{recursive:true});
for(const dir of ['brand/platforms','moxy'])await cp(path.join(root,'public',dir),path.join(out,dir),{recursive:true});
await build({absWorkingDir:root,entryPoints:['preview/onlyfans-media/App.tsx'],bundle:true,outfile:path.join(out,'app.js'),format:'esm',platform:'browser',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'synthetic-next',setup(b){b.onResolve({filter:/^next\/(navigation|link)$|^@\/app\/actions\/clone-scope$/},()=>({path:path.join(root,'preview/onlyfans-ui/next-shim.tsx')}));}}]});
const css=await postcss([tailwind({base:root,optimize:true})]).process(await readFile(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')});
await writeFile(path.join(out,'base.css'),css.css);
await writeFile(path.join(out,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Twin OnlyFans UI review</title><link rel="stylesheet" href="/base.css"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
console.log('Synthetic component review built:',out);

const index=await readFile(path.join(out,'index.html'),'utf8');
for(const section of ['overview','accounts','inbox','campaigns','content','sales','settings','operations']){const dir=path.join(out,'onlyfans',section);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'index.html'),index);}
await writeFile(path.join(out,'mobile.html'),`<!doctype html><html><head><title>Twin mobile UI review</title></head><body style="margin:0;background:#d8e5ef;font:14px Arial"><div style="padding:12px"><label>Device width <select onchange="document.querySelector('iframe').width=this.value"><option>390</option><option>430</option><option>768</option><option>1440</option></select></label> <label>Page <select onchange="document.querySelector('iframe').src='/onlyfans/'+this.value+'/'">${['overview','accounts','inbox','campaigns','content','sales','settings','operations'].map(x=>'<option>'+x+'</option>').join('')}</select></label> Synthetic component review</div><iframe title="Mobile OnlyFans review" src="/onlyfans/overview/" width="390" height="844" style="display:block;margin:0 auto;border:0;background:white"></iframe></body></html>`);

// Bundle shared product components into a self-contained, network-disabled demo.
const {build}=require('esbuild');
const postcss=require('postcss');
const tailwind=require('@tailwindcss/postcss');
const fs=require('node:fs');
const path=require('node:path');
const {gzipSync}=require('node:zlib');
const root=path.resolve(__dirname,'..');
const output=path.resolve(process.env.CRM_DEMO_OUT||path.join(root,'test-results/crm-demo'));
const navigation=`import React from 'react';
function target(href){const s=String(href||'');if(s.startsWith('#'))return s;return '#'+(s.includes('message')?'inbox':s.includes('media')||s.includes('ppvs')?'content':s.includes('team')?'team':s.includes('clones')||s.includes('creator')?'creators':s.includes('earning')?'reports':'overview')}
export default function Link({href,children,prefetch,replace,scroll,onClick,...rest}){return <a href={target(href)} {...rest} onClick={onClick}>{children}</a>}
export function useRouter(){return {push:href=>{location.hash=target(href)},replace:href=>{location.hash=target(href)},refresh:()=>{}}}
export function usePathname(){return location.hash.slice(1)||'overview'}
export function useSearchParams(){return new URLSearchParams()}
export function useLinkStatus(){return {pending:false}}
`;
(async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import App from './components/agency-demo/AgencyDemoWorkspace';import './components/agency-demo/workspace.css';createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,outdir:'out',minify:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},loader:{'.module.css':'local-css'},plugins:[{name:'demo-boundary',setup(b){
  b.onResolve({filter:/^(next\/|@\/components\/NavigationLink$)/},args=>({path:args.path,namespace:'demo-navigation'}));
  b.onLoad({filter:/.*/,namespace:'demo-navigation'},()=>({contents:navigation,loader:'tsx',resolveDir:root}));
  b.onResolve({filter:/^@\//},args=>{const base=path.resolve(root,args.path.slice(2));for(const ext of ['','.tsx','.ts','.css','/index.tsx','/index.ts'])if(fs.existsSync(base+ext)&&fs.statSync(base+ext).isFile())return {path:base+ext};throw Error('Missing demo source: '+args.path)});
 } }]});
 const globalCss=fs.readFileSync(path.join(root,'app/globals.css'),'utf8').replace('@import "shadcn/tailwind.css";','');
 const css=await postcss([tailwind({base:root,optimize:true})]).process(globalCss,{from:path.join(root,'app/globals.css')});
 const script=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text.replace(/<\/script/gi,'<\\/script');
 const styles=css.css+'\n'+fs.readFileSync(path.join(root,'app/agency-team.css'),'utf8')+'\n'+bundle.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
 const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>Twin Hybrid CRM | Demonstration</title><style>${styles.replace(/<\/style/gi,'<\\/style')}</style></head><body><div id="root"></div><noscript>Enable JavaScript to open the Twin CRM demonstration.</noscript><script>${script}</script></body></html>`;
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'index.html'),html);
 fs.writeFileSync(path.join(root,'lib/agency-demo/compiled.json'),JSON.stringify({encoding:'gzip-base64',html:gzipSync(html,{level:9}).toString('base64')}));
 console.log('Built CRM demonstration: '+path.join(output,'index.html')+' ('+Buffer.byteLength(html)+' bytes)');
})().catch(e=>{console.error(e);process.exitCode=1});

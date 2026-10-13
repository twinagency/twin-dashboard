// Production operator components with synthetic records; no live services.
import assert from "node:assert/strict";
import {readFileSync,mkdirSync} from "node:fs";
import path from "node:path";
import {createServer} from "node:http";
import {build} from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import {chromium} from "playwright";
const root=process.cwd(),out=path.join(root,"test-results/operator-workspace");
mkdirSync(out,{recursive:true});
const creatorId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const fixture=`
import React from "react";
import {createRoot} from "react-dom/client";
import {usePathname} from "next/navigation";
import Access from "./components/DashboardAccessProvider";
import Currency from "./components/CurrencyProvider";
import Blur from "./components/BlurProvider";
import Workspace from "./components/WorkspaceShell";
import Main from "./components/MainShell";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import MobileMenu from "./components/MobileMenu";
import Wordmark from "./components/TwinWordmark";
import CloneForm from "./components/CloneForm";
import {Card,CardHeader,CardTitle,CardContent} from "./components/ui/card";
const params=new URLSearchParams(location.search),brand=params.get("brand")||"Twin";
const agencyName=brand==="Twin"?undefined:brand,canManage=params.get("readonly")!=="true";
if(brand==="Moxy")document.documentElement.dataset.agency="moxy";
if(brand==="Jess and Kate AI")document.documentElement.dataset.brandTheme="ivory-cherry";
const clone={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Fixture Creator",stage_name:"Fixture Creator",slug:"fixture-creator",
status:params.has("paused")?"paused":"active",updated_at:"2026-10-11T00:00:00Z",uses_default_config:false,
business_username:"fixture_creator",ai_mode:"classic",charge_messages:true,starting_credits:10,credit_pack_size:30,
credit_pack_price_stars:299,paywall_prime_enabled:true,paywall_prime_before:3,intake:{fields:{},answers:""},
photos_enabled:true,videos_enabled:true,bundles_enabled:true,voice_enabled:false};
const clones=[{id:clone.id,name:params.get("longname")==="true"?"Fixture Creator With A Very Long Display Name":clone.name,color:"#768296"}];
function App(){const pathname=usePathname();return <Access agencyName={agencyName} canManage={canManage}><Currency usdPerStar={.02}><Blur>
<Workspace activeCloneId={clone.id}><Sidebar clones={clones} activeCloneId={clone.id}/><div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
<header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-white/12 px-4 py-3 lg:hidden">
<a href="/revenue" aria-label={brand}><Wordmark inverse agencyName={agencyName}/></a><div className="flex items-center gap-1">
<span className="px-3 py-2 text-sm text-white/80">Sign out</span><MobileMenu activeCloneId={clone.id}/></div></header>
<TopBar clones={clones} activeCloneId={clone.id} allTimeStars={0}/><Main activeCloneId={clone.id}>
<p className="mb-3 text-[10px] text-muted">Interface verification · synthetic test data</p>
{pathname.startsWith("/clones/")?<CloneForm clone={clone} promptPreview={{mode:"classic",blocks:[]}} photos={[]} videos={[]} bundles={[]} catalogueBundles={[]} appearanceColor="#768296"/>:
<div className="dashboard-page"><h1>{pathname==="/flows"?"Flows":pathname==="/logs"?"Activity Logs":"Creators"}</h1>
<Card><CardHeader><CardTitle>Fixture workspace</CardTitle></CardHeader><CardContent>Shared navigation and page surfaces</CardContent></Card></div>}
</Main></div></Workspace></Blur></Currency></Access>}
createRoot(document.getElementById("root")).render(<App/>);
`;
const navigation=`
import {useSyncExternalStore} from "react";
const original=history.pushState.bind(history);
history.pushState=(...args)=>{original(...args);dispatchEvent(new PopStateEvent("popstate"))};
const subscribe=f=>{addEventListener("popstate",f);return()=>removeEventListener("popstate",f)};
const snapshot=()=>location.pathname+location.search,useLocation=()=>useSyncExternalStore(subscribe,snapshot,snapshot);
export const usePathname=()=>useLocation().split("?")[0];
export const useSearchParams=()=>new URLSearchParams(useLocation().split("?")[1]||"");
export const useRouter=()=>({refresh(){},push(p){history.pushState({},"",p)},replace(p){history.replaceState({},"",p);dispatchEvent(new PopStateEvent("popstate"))}});
`;
const link=`import React from "react";export default function Link({href,children,onClick,...props}){return <a {...props} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented){e.preventDefault();history.pushState({},"",href)}}}>{children}</a>}`;
const actions=`export async function updateClone(){throw Error("Unexpected save")}export async function deleteClone(){throw Error("Unexpected delete")}export async function logout(){throw Error("Unexpected logout")}export async function setCloneScope(){throw Error("Unexpected scope mutation")}`;
const modules=new Map([["next/navigation",navigation],["next/link",link],["@/app/clones/actions",actions],["@/app/login/actions",actions],["@/app/actions/clone-scope",actions]]);
const bundle=await build({
stdin:{contents:fixture,resolveDir:root,sourcefile:"operator-ui-fixture.tsx",loader:"tsx"},
bundle:true,write:false,outfile:path.join(out,"fixture.js"),format:"iife",platform:"browser",jsx:"automatic",alias:{"@":root},
define:{"process.env.NODE_ENV":'"production"'},banner:{js:'var process={env:{NODE_ENV:"production"},browser:true};'},
plugins:[{name:"isolated-fixtures",setup(b){
b.onResolve({filter:/^(next\/navigation|next\/link|@\/app\/clones\/actions|@\/app\/login\/actions|@\/app\/actions\/clone-scope|@\/app\/media\/MediaManager|\.\/flow\/FlowGraph|@\/components\/TwinAssistant)$/},args=>({path:args.path,namespace:"fixture"}));
b.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"jsx",resolveDir:root,contents:modules.get(args.path)||
(args.path.includes("MediaManager")?'import React from "react";export default function Media(){return <div data-fixture-media className="rounded-2xl border border-line bg-panel p-6">Synthetic media library</div>}':
args.path.includes("FlowGraph")?'import React from "react";export default function Flow(){return <div data-fixture-flow className="rounded-2xl border border-line bg-panel p-6">Synthetic system flow</div>}':
'export default function Assistant(){return null}')}));
}}]});
const js=bundle.outputFiles.find(f=>f.path.endsWith(".js")).text;
const moduleCSS=bundle.outputFiles.filter(f=>f.path.endsWith(".css")).map(f=>f.text).join("\n");
const css=await postcss([tailwind()]).process('@import "./app/globals.css";\n@import "./app/jess-kate-theme.css";\n@import "./app/studio-workspace.css";',{from:path.join(root,"operator-ui.css")});
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>html{--font-sans:Arial,sans-serif;--font-display:Arial,sans-serif;--font-heading:Arial,sans-serif}body{margin:0}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const requests=[];
const server=createServer((req,res)=>{
const url=new URL(req.url,"http://localhost");res.setHeader("Cache-Control","no-store");
if(url.pathname==="/styles.css"){res.setHeader("Content-Type","text/css");return res.end(css.css+"\n"+moduleCSS)}
if(url.pathname==="/bundle.js"){res.setHeader("Content-Type","application/javascript");return res.end(js)}
if(url.pathname.startsWith("/api/")){requests.push({method:req.method,path:url.pathname});res.setHeader("Content-Type","application/json");
if(url.pathname==="/api/models")return res.end("[]");if(url.pathname==="/api/fx")return res.end(JSON.stringify({usd_to_aud:1.4}));
res.statusCode=403;return res.end(JSON.stringify({error:"No live service in this fixture"}))}
if(url.pathname.startsWith("/moxy/")&&url.pathname.endsWith(".svg")){res.setHeader("Content-Type","image/svg+xml");return res.end(readFileSync(path.join(root,"public",url.pathname)))}
if(url.pathname.startsWith("/dashboard/fans/")||url.pathname==="/favicon.ico"){res.statusCode=204;return res.end()}
res.setHeader("Content-Type","text/html");res.end(html)});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin=`http://127.0.0.1:${server.address().port}`,external=[],snapshots=[];
const domains=["Identity","Configuration","Monetization","Advanced","System view","PPV library"];
const payload=page=>page.evaluate(()=>Array.from(new FormData(document.getElementById("creator-control-plane-form"))).map(([k,v])=>[k,typeof v==="string"?v:"[file]"]).sort((a,b)=>a[0].localeCompare(b[0])));
const noOverflow=async(page,label)=>{const size=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth,main:document.querySelector("main.dashboard-main").scrollWidth,client:document.querySelector("main.dashboard-main").clientWidth}));
assert.ok(size.document<=size.viewport+1&&size.main<=size.client+1,`${label}: overflow ${JSON.stringify(size)}`);
const controls=await page.locator(".workspace-account-controls").evaluateAll(elements=>elements.flatMap(element=>{
const container=element.getBoundingClientRect();return Array.from(element.children).filter(child=>child.getClientRects().length).map(child=>{
const rect=child.getBoundingClientRect();return {left:rect.left,right:rect.right,start:container.left,end:container.right}})}));
assert.ok(controls.every(rect=>rect.left>=rect.start-1&&rect.right<=rect.end+1),`${label}: clipped account controls ${JSON.stringify(controls)}`)};
const capture=async(page,file)=>{await page.locator("main.dashboard-main").evaluate(element=>element.scrollTop=0);await page.screenshot({path:path.join(out,file)})};
let browser;
try{
if(process.argv.includes("--build-only"))console.log("PASS: shared operator components and styles compile.");
else{
browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || undefined});
for(const brand of ["Twin","Moxy","FLIRT","LYNQ","Tether","Jess and Kate AI"]){
for(const width of [390,1440,...(brand==="Moxy"?[320]:[])]){
const context=await browser.newContext({viewport:{width,height:900},colorScheme:"light",reducedMotion:"reduce"});
await context.route("**/*",route=>{const url=new URL(route.request().url());if(url.origin!==origin){external.push(url.href);return route.abort()}return route.continue()});
const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(String(e)));
const query=new URLSearchParams({brand,tab:"identity"});if(width===320){query.set("paused","true");query.set("longname","true")}
await page.goto(`${origin}/clones/${creatorId}?${query}`,{waitUntil:"networkidle"});
await page.addStyleTag({content:"*,*::before,*::after{transition:none!important;animation:none!important}"});
await page.locator('[data-creator-studio="identity"]').waitFor();
assert.equal(await page.locator("[data-intelligence-workspace]").count(),0,"Demo policies do not enter partner or other-creator forms");
assert.equal(await page.locator('[data-studio-workspace="true"]').count(),1);
const nav=page.getByRole("navigation",{name:"Control Panel sections",exact:true});
const color=await nav.getByRole("button",{name:"Identity",exact:true}).evaluate(e=>getComputedStyle(e).borderTopColor);
if(brand==="Moxy")assert.equal(color,"rgb(117, 38, 56)","Moxy burgundy");
if(brand==="LYNQ")assert.equal(color,"rgb(41, 59, 234)","LYNQ blue");
if(brand==="Jess and Kate AI")assert.equal(color,"rgb(122, 23, 52)","Cherry branding");
await noOverflow(page,`${brand} ${width} identity`);
const slug=brand.toLowerCase().replaceAll(" ","-");
await capture(page,`${slug}-${width}-identity.png`);
await page.getByRole("navigation",{name:"Identity sections",exact:true}).getByRole("button",{name:"Profile",exact:true}).click();
const draft=page.locator('input[name="stage_name"]');await draft.fill("Unsaved creator draft");
const submitted=await payload(page);assert.ok(submitted.length>150);await draft.evaluate(e=>window.__draftNode=e);
for(const label of domains){
await nav.getByRole("button",{name:label,exact:true}).click();await noOverflow(page,`${brand} ${width} ${label}`);
assert.deepEqual(await payload(page),submitted,`${brand} ${label}: complete payload and draft retained`);
assert.equal(await draft.evaluate(e=>e===window.__draftNode),true);
if(["Configuration","Monetization"].includes(label))await capture(page,`${slug}-${width}-${label.toLowerCase()}.png`);
}
await nav.getByRole("button",{name:"Monetization",exact:true}).click();
const preview=await page.locator("[data-studio-money=preview]").innerText();assert.match(preview,/Fixture Creator/);assert.doesNotMatch(preview,/Brianna|BR/);
if(width<1024){
assert.ok(await page.locator(".dashboard-mobile-header").evaluate(e=>e.getBoundingClientRect().height<=72),"Compact phone header");
if(brand==="Moxy")assert.equal(await page.locator(".dashboard-mobile-header img").isVisible(),true);
await page.getByRole("button",{name:"Open navigation",exact:true}).click();await page.locator("#mobile-sidebar").waitFor();
if(brand!=="Twin")assert.equal(await page.locator("#mobile-sidebar").getByRole("link",{name:"Earnings Split",exact:true}).count(),0);
await page.locator("#mobile-sidebar").getByRole("button",{name:"Close navigation",exact:true}).click();
}
await nav.getByRole("button",{name:"Identity",exact:true}).click();await nav.getByRole("button",{name:"Configuration",exact:true}).click();
await page.goBack();await page.locator('[data-creator-studio="identity"]').waitFor();assert.equal(await draft.inputValue(),"Unsaved creator draft");
if(brand!=="Twin"){
await page.goto(`${origin}/clones/${creatorId}?brand=${encodeURIComponent(brand)}&readonly=true&tab=identity`,{waitUntil:"networkidle"});
assert.equal(await page.locator('input[name="stage_name"]').isDisabled(),true);
assert.equal(await page.getByRole("button",{name:"Save changes",exact:true}).count(),0);
await page.locator("button[data-readonly-navigation]").filter({hasText:"Daily rhythm"}).click();
assert.equal(new URLSearchParams(new URL(page.url()).search).get("panel"),"life");await noOverflow(page,`${brand} readonly`);
}
for(const route of ["/clones","/flows","/logs"]){
await page.goto(`${origin}${route}?brand=${encodeURIComponent(brand)}`,{waitUntil:"networkidle"});
assert.equal(await page.locator('[data-studio-workspace="true"]').count(),1);await noOverflow(page,`${brand} ${route}`);
}
assert.deepEqual(errors,[],`${brand} ${width}: runtime errors`);
snapshots.push({brand,width,fields:submitted.length,accent:color});await context.close();
}}
assert.deepEqual(external,[]);assert.deepEqual(requests.filter(r=>r.method!=="GET"||!["/api/models","/api/fx"].includes(r.path)),[]);
console.log("PASS: six brands; desktop and phone; all configuration tabs; payload, draft/history and read-only checks; no overflow or writes.");
console.log(JSON.stringify(snapshots));
}
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}


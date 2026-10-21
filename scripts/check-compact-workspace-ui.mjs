// Production operator components with synthetic records; no live services.
import assert from "node:assert/strict";
import {readFileSync,mkdirSync} from "node:fs";
import path from "node:path";
import {createServer} from "node:http";
import {build} from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import {chromium} from "playwright";
import {creatorDemoData} from "../lib/creator-demo-data.ts";
const root=process.cwd(),out=path.join(root,"test-results/compact-workspace");
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
import MobileNav from "./components/WorkspaceMobileNav";
import Messages from "./components/MessagesWorkspace";
import AgencyOverview from "./components/agency-overview/AgencyOverview";
import LiveOverview from "./components/dashboard/LiveDashboardOverview";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import MobileMenu from "./components/MobileMenu";
import Wordmark from "./components/TwinWordmark";
import ChannelCreatorRoster from "./components/ChannelCreatorRoster";
import CloneForm from "./components/CloneForm";
import {Card,CardHeader,CardTitle,CardContent} from "./components/ui/card";
const params=new URLSearchParams(location.search),brand=params.get("brand")||"Twin";
const agencyName=brand==="Twin"?undefined:brand,canManage=params.get("readonly")!=="true";
if(brand==="Twin")document.documentElement.dataset.brandTheme="twin-light";
if(brand==="Moxy")document.documentElement.dataset.agency="moxy";
const channels=brand==="Twin"?["all","telegram","onlyfans"]:["all"];
if(brand==="Jess and Kate AI")document.documentElement.dataset.brandTheme="ivory-cherry";
const clone={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Fixture Creator",stage_name:"Fixture Creator",slug:"fixture-creator",
status:params.has("paused")?"paused":"active",updated_at:"2026-10-11T00:00:00Z",uses_default_config:false,
business_username:"fixture_creator",ai_mode:"classic",charge_messages:true,starting_credits:10,credit_pack_size:30,
credit_pack_price_stars:299,paywall_prime_enabled:true,paywall_prime_before:3,intake:{fields:{},answers:""},
photos_enabled:true,videos_enabled:true,bundles_enabled:true,voice_enabled:false};
const clones=[{id:clone.id,name:params.get("longname")==="true"?"Fixture Creator With A Very Long Display Name":clone.name,color:"#768296"}];
const roster={schemaVersion:"channel-roster.v1",telegram:{status:"ready",error:null,items:[{id:clone.id,name:clone.name,status:"active",handle:"fixture_tg",color:clones[0].color},{id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"Telegram Only",status:"active",handle:null,color:"#4fa7d9"}]},onlyfans:{status:"ready",error:null,items:[{id:"of-a",creatorId:clone.id,creatorName:clone.name,handle:"fixture_of",health:"connected"},{id:"of-a2",creatorId:clone.id,creatorName:clone.name,handle:"fixture_of_two",health:"connected"},{id:"of-c",creatorId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",creatorName:"OnlyFans Only",handle:"onlyfans_only",health:"connected"}]}};
window.__roster=roster;
function App(){const pathname=usePathname();return <Access agencyName={agencyName} canManage={canManage}><Currency usdPerStar={.02}><Blur>
<Workspace activeCloneId={clone.id}><Sidebar clones={clones} activeCloneId={clone.id} channels={channels}/><div className="workspace-content flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
<header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-white/12 px-4 py-3 lg:hidden">
<a href="/revenue" aria-label={brand}><Wordmark inverse agencyName={agencyName}/></a><div className="flex items-center gap-1">
<span className="px-3 py-2 text-sm text-white/80">Sign out</span><MobileMenu activeCloneId={clone.id} channels={channels}/></div></header>
<TopBar clones={clones} activeCloneId={clone.id} allTimeStars={0} channels={channels}/><Main activeCloneId={clone.id}>
<p className="mb-3 text-[10px] text-muted">Interface verification · synthetic test data</p>
{pathname==="/users"?<div className="users-workspace"><Messages selected><section className="users-panel users-panel-list">Conversations</section><section className="users-panel users-panel-chat">Chat history<textarea aria-label="Draft message" defaultValue="Keep this draft"/></section><section className="users-panel users-panel-profile"><h2>Profile summary</h2><p>Saved fan facts</p><p>Long-term memory</p></section></Messages></div>:pathname==="/revenue"&&brand==="Moxy"?<AgencyOverview initialCreators={clones.map(c=>({...c,photoUrl:null,photoId:null,position:"50% 35%",zoom:1,fans:1234,telegramConnected:true}))}/>:pathname==="/dashboard"&&params.has("earnings")?<LiveOverview clones={clones}/>: ["/telegram","/overview","/dashboard"].includes(pathname)?<div className="dashboard-page"><ChannelCreatorRoster channel={pathname==="/telegram"?"telegram":"all"} roster={{...roster,onlyfans:pathname==="/telegram"?{status:"not_requested",items:[],error:null}:params.has("of_unavailable")?{status:"unavailable",items:[],error:"OnlyFans accounts could not be loaded."}:roster.onlyfans}}/></div>:pathname.startsWith("/clones/")?<CloneForm clone={clone} promptPreview={{mode:"classic",blocks:[]}} photos={[]} videos={[]} bundles={[]} catalogueBundles={[]} appearanceColor="#768296"/>:
<div className="dashboard-page"><h1>{pathname==="/flows"?"Flows":pathname==="/logs"?"Activity Logs":"Creators"}</h1>
<Card><CardHeader><CardTitle>Fixture workspace</CardTitle></CardHeader><CardContent>Shared navigation and page surfaces</CardContent></Card></div>}
</Main><MobileNav activeCloneId={clone.id} channels={channels}/></div></Workspace></Blur></Currency></Access>}
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
const actions=`export async function updateClone(){throw Error("Unexpected save")}export async function deleteClone(){throw Error("Unexpected delete")}export async function logout(){throw Error("Unexpected logout")}export async function setCloneScope(id){window.__pickedClone=id}`;
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
const css=await postcss([tailwind()]).process('@import "./app/globals.css";\n@import "./app/jess-kate-theme.css";\n@import "./app/creator-workspace.css";\n@import "./app/studio-workspace.css";\n@import "./app/twin-theme.css";\n@import "./app/moxy-overview.css";\n@import "./app/compact-workspace.css";',{from:path.join(root,"operator-ui.css")});
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>html{--font-sans:Arial,sans-serif;--font-display:Arial,sans-serif;--font-heading:Arial,sans-serif}body{margin:0}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const requests=[];
const server=createServer((req,res)=>{
const url=new URL(req.url,"http://localhost");res.setHeader("Cache-Control","no-store");
if(url.pathname==="/styles.css"){res.setHeader("Content-Type","text/css");return res.end(css.css+"\n"+moduleCSS)}
if(url.pathname==="/bundle.js"){res.setHeader("Content-Type","application/javascript");return res.end(js)}
if(url.pathname.startsWith("/api/")){requests.push({method:req.method,path:url.pathname});res.setHeader("Content-Type","application/json");
if(url.pathname==="/api/channel-roster")return res.end(JSON.stringify({schemaVersion:"channel-roster.v1",telegram:{status:url.searchParams.get("channel")==="onlyfans"?"not_requested":"ready",error:null,items:url.searchParams.get("channel")==="onlyfans"?[]:[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Fixture Creator",status:"active",handle:"fixture_tg",color:"#4fa7d9"}]},onlyfans:{status:url.searchParams.get("channel")==="telegram"?"not_requested":"ready",error:null,items:url.searchParams.get("channel")==="telegram"?[]:[{id:"of-a",creatorId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",creatorName:"Fixture Creator",handle:"fixture_of",health:"connected"},{id:"of-c",creatorId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",creatorName:"OnlyFans Only",handle:"onlyfans_only",health:"connected"}]}}));
if(url.pathname==="/api/dashboard")return res.end(JSON.stringify(creatorDemoData(url.searchParams.get("period")||"1M")));
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
try {
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || undefined});
 for (const brand of ["Twin","Moxy"]) for (const width of [390,768,1440]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:"reduce"});
  const page=await context.newPage(), errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await context.route("**/*",route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(`${origin}${brand==="Twin"?"/dashboard?earnings=1&workspace=telegram&":"/revenue?"}brand=${brand}`,{waitUntil:"networkidle"});
  await page.getByRole("heading",{name:"Overview",exact:true}).waitFor();
  assert.equal(await page.getByRole("link",{name:/^View creators$|^Live Telegram Chat$/}).count(),0);
  await noOverflow(page,`${brand} overview ${width}`);
  await page.screenshot({path:path.join(out,`${brand}-${width}-overview.png`)});
  if(width<1024) {
   const nav=page.getByRole("navigation",{name:"Quick navigation"});
   assert.equal(await nav.isVisible(),true);
   const geometry=await nav.boundingBox();assert.ok(geometry.y+geometry.height<=900, "Bottom navigation stays inside viewport");
   await nav.getByRole("button",{name:"Open navigation",exact:true}).click();
   const drawer=page.getByRole("dialog",{name:"Main navigation"});await drawer.waitFor();
   await page.keyboard.press("Escape");assert.equal(await drawer.count(),0);
  }
  await page.goto(`${origin}/users?brand=${brand}`,{waitUntil:"networkidle"});
  await noOverflow(page,`${brand} messages ${width}`);
  if(width<1024) {
   assert.equal(await page.locator(".users-panel-chat").isVisible(),true);
   await page.getByRole("button",{name:"Profile & memory",exact:true}).click();
   assert.equal(await page.getByRole("heading",{name:"Profile summary"}).isVisible(),true);
   assert.equal(await page.getByText("Long-term memory",{exact:true}).isVisible(),true);
   await page.getByRole("button",{name:"Chat & history",exact:true}).click();
   assert.equal(await page.getByLabel("Draft message").inputValue(),"Keep this draft");
  } else for(const panel of ["list","chat","profile"]) assert.equal(await page.locator(`.users-panel-${panel}`).isVisible(),true);
  await page.screenshot({path:path.join(out,`${brand}-${width}-messages.png`)});
  assert.deepEqual(errors,[],`${brand} ${width} browser errors`);
  await context.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:900}});
 await page.goto(`${origin}/dashboard?brand=Twin`,{waitUntil:"networkidle"});
 const disconnected=page.locator('[data-roster-creator="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"] [data-onlyfans-disconnected]');
 assert.equal(await disconnected.getAttribute("aria-disabled"),"true");
 assert.match(await disconnected.innerText(),/Not connected/);
 assert.equal(await disconnected.locator("a").count(),0);
 await page.goto(`${origin}/dashboard?brand=Twin&of_unavailable=1`,{waitUntil:"networkidle"});
 assert.match(await page.locator("[data-onlyfans-disconnected]").first().innerText(),/unavailable/);
 console.log("PASS: compact Twin/Moxy overview, 390/768/1440 layouts, drawers, mobile navigation, chat/profile/history access, retained draft and truthful OnlyFans states.");
} finally { await browser?.close(); server.close(); }

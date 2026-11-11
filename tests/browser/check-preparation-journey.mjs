import {build} from "esbuild";
import {chromium} from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
const root=path.resolve(import.meta.dirname,"../.."),out=process.env.PREPARATION_BROWSER_OUTPUT;
if(!out)throw Error("PREPARATION_BROWSER_OUTPUT required");
await fs.mkdir(out,{recursive:true});
await build({absWorkingDir:root,entryPoints:["tests/browser/preparation-journey.tsx"],bundle:true,
 outfile:path.join(out,"app.js"),format:"esm",platform:"browser",jsx:"automatic",minify:true,
 define:{"process.env.NODE_ENV":'"production"'}});
const html='<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:15px system-ui;color:#20242d}details{border:1px solid #ddd;padding:16px;margin:8px 0}form{display:grid;gap:12px}input{display:block;box-sizing:border-box;width:100%;padding:8px}button{padding:8px;margin:4px}p{overflow-wrap:anywhere} @media(min-width:640px){form{grid-template-columns:1fr 1fr}}</style><div id="root"></div><script type="module" src="/app.js"></script>';
const server=http.createServer(async(req,res)=>{res.setHeader("Content-Type",req.url==="/app.js"?"text/javascript":"text/html");res.end(req.url==="/app.js"?await fs.readFile(path.join(out,"app.js")):html);});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
let browser;let checks=0;const check=(v,message)=>{assert(v,message);checks++;};
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  await page.goto("http://127.0.0.1:"+server.address().port);
  const panel=page.locator("[data-commercial-preparation]").first();
  await panel.locator("summary").click();
  await panel.getByLabel("FansAPI account ID").fill("acct_fixture");
  await panel.getByLabel("OnlyFans creator ID").fill("123");
  await panel.getByLabel("Maximum provider requests").fill("20");
  await panel.getByLabel("Maximum provider credits",{exact:true}).fill("40");
  await panel.getByLabel("Approved credits reserved per request").fill("2");
  await panel.getByLabel("Budget approval reference").fill("synthetic browser fixture only");
  await panel.getByRole("button",{name:"Save read-only preparation"}).click();
  await panel.getByRole("button",{name:"Retry same request"}).waitFor();
  check(await panel.getByRole("button",{name:"Save read-only preparation"}).isDisabled(),"unconfirmed command holds changes");
  check(await panel.getByLabel("Maximum provider requests").isDisabled(),"unconfirmed command freezes editable fields");
  await panel.getByRole("button",{name:"Retry same request"}).click();
  await panel.getByRole("button",{name:"Stop preparation"}).waitFor();
  const bodies=await page.evaluate(()=>window.preparationBodies);
  check(JSON.stringify(bodies[0])===JSON.stringify(bodies[1]),"retry uses exact original body and nonce");
  check(await panel.getByLabel("FansAPI account ID").isDisabled(),"reviewed provider identity remains fixed");
  check(await panel.getByText(/0 \/ 20 requests reserved/).isVisible(),"recorded budget remains visible");
  await panel.getByRole("button",{name:"Stop preparation"}).click();
  await panel.getByRole("button",{name:"Resume preparation"}).waitFor();
  check(await panel.getByText(/Preparation stopped/).isVisible(),"stop result rendered");
  const readonly=page.locator("[data-commercial-preparation]").nth(1);await readonly.locator("summary").click();
  check(await readonly.getByRole("button",{name:"Save read-only preparation"}).isDisabled(),"read-only user cannot save");
  check(await readonly.getByLabel("FansAPI account ID").isDisabled(),"read-only form is disabled");
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"no horizontal page overflow");
  check(errors.length===0,"no browser errors");
  await page.screenshot({path:path.join(out,"preparation-"+width+".png"),fullPage:true});
  await page.close();
 }
 console.log(JSON.stringify({result:"passed",checks,widths:[1440,390],component:"actual Preparation component",wire:"explicit synthetic fetch",css:"minimal browser fixture CSS"}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}

/** Offline click-to-handover regression. Every API response is synthetic. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";
const root=path.resolve(import.meta.dirname,"..");
const output=await fs.mkdtemp(path.join(os.tmpdir(),"of-takeover-"));
const entry = `
import React from "react";
import {createRoot} from "react-dom/client";
import OnlyFansWorkspace from "@/components/onlyfans-preview/OnlyFansWorkspace";
import {accounts,conversationDetails} from "@/lib/onlyfans-preview/fixtures";
const detail=structuredClone(Object.values(conversationDetails)[0]);
const account=structuredClone(accounts.find(a=>a.accountId===detail.summary.accountId)||accounts[0]);
detail.accountId=account.accountId; detail.summary.accountId=account.accountId;
detail.summary.automationMode="automated"; detail.summary.takeoverState="none"; detail.summary.delivery="sent"; detail.summary.revision=7;
detail.deliveryIncident=null;
account.health="connected";
for(const key of Object.keys(account.capabilities)) account.capabilities[key]="available";
const freshness={asOf:new Date().toISOString(),stale:false,ageSeconds:0};
account.freshness=freshness;detail.freshness=freshness;
const scenario=new URLSearchParams(location.search).get("scenario");
window.__takeoverPosts=[];
window.fetch=async(input,init={})=>{
 const url=new URL(String(input),location.origin), p=url.pathname;
 if((init.method||"GET")==="POST"){
  if(!p.startsWith("/api/onlyfans-controls/")) throw Error("Unexpected write");
  const body=JSON.parse(init.body);window.__takeoverPosts.push(body);
  if(scenario==="refused") return Response.json({schemaVersion:"of-controls.v1",ok:false,outcome:"refused",error:"Conversation controls are not configured."},{status:503});
  if(scenario==="conflict") return Response.json({schemaVersion:"of-controls.v1",ok:false,outcome:"refused",error:"The conversation changed or has an active hold. Refresh before trying again."},{status:409});
  if(body.action!=="request_takeover") throw Error("Only synthetic takeover is allowed");
  detail.summary.automationMode="human_controlled";detail.summary.takeoverState=scenario==="held"?"requested":"effective";detail.summary.delivery=scenario==="held"?"dispatching":"sent";detail.summary.revision++;
  return Response.json({schemaVersion:"of-controls.v1",ok:true,applied:true,commandKey:"a".repeat(64),accountId:account.accountId,conversationId:detail.summary.conversationId,action:body.action,recordedRevision:detail.summary.revision});
 }
 if(p.endsWith("/accounts")) return Response.json({accounts:[account]});
 if(p.endsWith("/handover")) return Response.json({schemaVersion:"of-handover.v1",accountId:account.accountId,conversationId:detail.summary.conversationId,revision:detail.summary.revision,mode:detail.summary.automationMode,takeoverState:detail.summary.takeoverState,owner:detail.summary.takeoverState==="effective"?"you":null,canActAsOwner:true,hasMore:false,events:[]});
 if(p.endsWith("/conversations")) return Response.json({page:{items:[detail.summary],nextCursor:null}});
 if(p.includes("/conversations/")) return Response.json({conversation:detail});
 return Response.json({error:"Synthetic content unavailable"},{status:503});
};
createRoot(document.getElementById("root")).render(<OnlyFansWorkspace view="inbox" source="server" canManage/>);
`;
let server,browser;
try {
 await build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,sourcefile:"takeover-fixture.tsx",loader:"tsx"},bundle:true,outfile:path.join(output,"app.js"),platform:"browser",format:"esm",jsx:"automatic",define:{"process.env.NODE_ENV":'"development"'},plugins:[{name:"local-next",setup(b){b.onResolve({filter:/^next\/(navigation|link)$|^@\/app\/actions\/clone-scope$/},()=>({path:path.join(root,"preview/onlyfans-ui/next-shim.tsx")}));}}]});
 await fs.writeFile(path.join(output,"index.html"),'<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
 server=http.createServer(async(req,res)=>{
  try {const name=new URL(req.url,"http://local").pathname;const file=name==="/app.js"||name==="/app.css"?name.slice(1):"index.html";res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":"text/html");res.end(await fs.readFile(path.join(output,file)));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const origin="http://127.0.0.1:"+server.address().port;
 let executablePath=process.env.PREVIEW_CHROME;
 for(const candidate of ["C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"]){if(executablePath)break;try{await fs.access(candidate);executablePath=candidate;}catch{}}
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route("**/*",route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 const errors=[]; page.on("pageerror",error=>{errors.push(String(error));console.error("Browser:",String(error));});
 await page.goto(origin+"/onlyfans/inbox?scenario=accepted");
 const takeover=page.locator('[data-of-action="request_takeover"]'),composer=page.locator("[data-of-composer]");
 // The post-command refresh can hold the composer for a moment after feedback renders; wait (bounded) so the send-lock read below is the settled state, not the pending one.
 const composerSettled=()=>page.waitForFunction(()=>document.querySelector("[data-of-composer]")?.disabled===false,null,{timeout:5000});
 await takeover.waitFor({timeout:15000});
 assert.equal(await composer.isEnabled(),true);
 await composer.fill("Synthetic draft before takeover");
 assert.equal(await page.locator("[data-of-send]").isDisabled(),true);
 await page.locator("[data-of-composer-takeover]").click();
 await page.locator('[data-of-action="release_takeover"]').waitFor({timeout:15000});
 await page.waitForFunction(()=>document.querySelector("[data-of-composer]")?.disabled===false);
 assert.equal(await composer.isEnabled(),true);
 assert.equal(await page.locator("[data-of-attach-vault]").isEnabled(),true);
 assert.equal(await page.locator("[data-of-send]").isEnabled(),true);
 assert.equal(await page.locator("[data-of-composer-takeover]").count(),0);
 assert.equal(await page.evaluate(()=>window.__takeoverPosts.length),1);
 assert.equal(await page.evaluate(()=>window.__takeoverPosts[0].action),"request_takeover");
 console.log("PASS accepted takeover: one request, manual control, composer unlocked");
 await page.goto(origin+"/onlyfans/inbox?scenario=refused");
 await takeover.waitFor();await page.locator("[data-of-composer-takeover]").click();
 await page.locator("[data-of-command-result]").waitFor();
 await composerSettled();assert.equal(await composer.isEnabled(),true);
 assert.equal(await page.locator("[data-of-send]").isDisabled(),true);
 const message=await page.locator("[data-of-command-result]").innerText();
 console.log("Observed refused-control message:",message.replace(/\s+/g," "));
 assert.match(message,/Conversation controls are not configured\./,"The exact approved configuration failure must be visible, instead of an unrelated session instruction");
 assert.equal(await page.locator("[data-of-command-result]").getAttribute("role"),"alert");
 const feedbackBox=await page.locator("[data-of-command-result]").boundingBox(),buttonBox=await takeover.boundingBox();
 assert(feedbackBox&&buttonBox&&feedbackBox.y<buttonBox.y,"Failure feedback appears before the clicked control");
 await page.goto(origin+"/onlyfans/inbox?scenario=conflict");
 await page.locator("[data-of-composer-takeover]").waitFor();await page.locator("[data-of-composer-takeover]").click();
 await page.getByText("The conversation changed or has an active hold. Refresh before trying again.",{exact:true}).waitFor();
 await composerSettled();assert.equal(await composer.isEnabled(),true);
 assert.equal(await page.locator("[data-of-send]").isDisabled(),true);
 assert.equal(await page.evaluate(()=>window.__takeoverPosts.length),1);
 console.log("PASS conflict: one request, clear error, manual send remains locked");
 await page.goto(origin+"/onlyfans/inbox?scenario=held");
 await page.locator("[data-of-composer-takeover]").waitFor();await page.locator("[data-of-composer-takeover]").click();
 await page.getByText("Waiting for the current delivery to settle. Manual replies stay paused until handover completes.",{exact:true}).waitFor();
 await composerSettled();assert.equal(await composer.isEnabled(),true);
 assert.equal(await page.locator("[data-of-send]").isDisabled(),true);
 assert.equal(await page.locator("[data-of-attach-vault]").isEnabled(),true);
 assert.equal(await page.locator("[data-of-composer-takeover]").count(),0);
 assert.equal(await page.evaluate(()=>window.__takeoverPosts.length),1);
 console.log("PASS unsettled send: takeover requested, drafts remain editable while sending stays locked");
 assert.deepEqual(errors,[]);
 console.log("PASS refused takeover: no false manual control, clear visible error; 0 page errors");
} finally {
 await browser?.close();
 if(server)await new Promise(resolve=>server.close(resolve));
 await fs.rm(output,{recursive:true,force:true});
}

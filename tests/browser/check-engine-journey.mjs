import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
const dist = process.env.ENGINE_BROWSER_OUTPUT, shots = process.env.ENGINE_BROWSER_ARTIFACTS;
if (!dist || !shots) throw new Error("Browser output and artifact directories are required");
await fs.mkdir(shots, { recursive: true });
const files = { "/": [path.join(dist,"index.html"), "text/html"], "/app.js": [path.join(dist,"app.js"), "text/javascript"],
  "/app.css": [path.join(dist,"app.css"), "text/css"], "/base.css": [path.join(dist,"base.css"), "text/css"],
  "/journey.json": [process.env.ENGINE_JOURNEY_ARTIFACT || "/evidence/synthetic-journey-final.json", "application/json"],
  "/sequence.json": [process.env.ENGINE_SEQUENCE_ARTIFACT || "/evidence/sequence-projection-final.json", "application/json"] };
const server = http.createServer(async (req,res) => {
  try { const item = files[new URL(req.url,"http://localhost").pathname]; if (!item) throw new Error("not found");
    res.writeHead(200,{ "Content-Type": item[1], "Cache-Control":"no-store" }); res.end(await fs.readFile(item[0]));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser; let checks=0;
const check=(v,msg)=>{assert(v,msg); checks++;};
try {
  browser=await chromium.launch({headless:true, ...(process.env.PREVIEW_CHROME ? {executablePath:process.env.PREVIEW_CHROME} : {}), args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage({reducedMotion:"reduce"}), errors=[];
  await page.route("**/*", route => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
  page.on("pageerror", error => errors.push(String(error)));
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(origin + "/",{waitUntil:"load"});
    if (width < 1024) await page.locator("[data-of-mobile-panel=chat]").click();
    check(await page.locator("span.whitespace-pre-wrap").filter({hasText:"Two plus two is four."}).isVisible(),"The actual simulated receipt is visible in the inbox");
    if (width < 1024) await page.locator("[data-of-mobile-panel=controls]").click();
    const section=page.getByRole("region",{name:"Conversation requests"});
    await section.waitFor();
    check(await section.getByText("Reply completed").isVisible(),"The same end-to-end journey shows its completed request");
    if (width < 1024) await page.locator("[data-of-sheet-close]").click();
    await page.locator("[data-load-sequence]").click();
    if (width < 1024) await page.locator("[data-of-mobile-panel=controls]").click();
    check(await section.getByText("1 of 3 reply parts sent; remaining parts pending").isVisible(),"Actual ordered backend projection rendered");
    check(await section.getByText(/Simulation/).isVisible(),"Synthetic environment identified");
    const request=section.getByRole("button",{name:"Request responsibility"});
    await request.click(); check(await request.isDisabled(),"Pending action cannot be submitted twice");
    await section.getByText("Waiting for a team member to accept").waitFor();
    await section.getByRole("button",{name:"Accept responsibility"}).click();
    await section.getByText("Team member accepted responsibility").waitFor();
    const complete=section.getByRole("button",{name:"Mark completed"});
    check(await complete.isDisabled(),"Resolution requires a review note");
    await section.getByLabel("Review evidence").fill("Checked the synthetic request");
    await complete.click(); await section.getByText("Reply completed").waitFor();
    const calls=await page.evaluate(()=>window.actions);
    check(calls.length===3 && calls[2].note==="Checked the synthetic request","Operator actions and note captured by fixture handler");
    if(width < 1024) { await page.locator("[data-of-mobile-panel=chat]").click(); }
    check(await page.locator("span.whitespace-pre-wrap").filter({hasText:"Two plus two is four."}).isVisible(),"Actual simulated receipt is visible in the inbox");
    check(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1),"No page overflow");
    await page.screenshot({path:path.join(shots,`engine-journey-${width}.png`),fullPage:true});
  }
  check(errors.length===0,`Browser errors: ${errors.join("; ")}`);
  console.log(`Engine journey browser: ${checks} assertions passed at desktop and mobile widths using backend-generated projections and a simulated action handler.`);
} finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }

import assert from "node:assert/strict";
import path from "node:path";
export async function checkCombinedEarnings(page,context,origin){
 await page.goto(origin+"/revenue",{waitUntil:"load",timeout:90000});
 await page.locator("[data-combined-telegram]").waitFor({timeout:60000});
 assert.match(await page.locator("[data-combined-telegram]").innerText(),/Unavailable/);
 assert.match(await page.locator("[data-combined-onlyfans]").innerText(),/Unavailable/);
 assert.equal(await page.getByText("0 Stars",{exact:true}).count(),0,"an unavailable source must not look like zero earnings");
 const [response]=await Promise.all([
  page.waitForResponse(r=>r.url().includes("/api/combined-earnings?period=1W")),
  page.locator("[data-combined-period]").selectOption("1W"),
 ]);assert.equal(response.status(),200);const result=await response.json();
 assert.equal(result.period,"1W");assert.deepEqual(result.window,result.onlyfans.window);
 await page.locator("[data-combined-onlyfans]").waitFor();
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"combined earnings overflows mobile");
 if(process.env.ONLYFANS_TEST_EVIDENCE)await page.screenshot({path:path.join(process.env.ONLYFANS_TEST_EVIDENCE,"combined-earnings-mobile.png"),fullPage:true});
 await context.clearCookies();await page.getByRole("button",{name:"Refresh earnings",exact:true}).click();
 await page.getByText("An internal operator session is required to read combined earnings.",{exact:true}).waitFor();
 assert.equal(await page.locator("[data-combined-onlyfans]").count(),0);
 await context.addCookies([{name:"allie_admin_session",value:process.env.ONLYFANS_TEST_COOKIE,url:origin}]);
 await page.setViewportSize({width:1440,height:1000});
 console.log("Combined earnings browser PASS: real shared period, unavailable-source honesty, original units, session loss and mobile layout");
}

import assert from "node:assert/strict";
import path from "node:path";
export async function checkVaultPreviews(page,context,origin){
 const endpoint=origin+"/api/onlyfans-content/accounts/acc-a/vault/previews/11";
 const image=page.locator('[data-of-vault-image="11"]');await image.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>{const img=document.querySelector('[data-of-vault-image="11"] img');return img?.complete&&img.naturalWidth===96&&img.naturalHeight===128;});
 const response=await page.request.get(endpoint);assert.equal(response.status(),200);assert.equal(response.headers()["content-type"],"image/png");assert.equal(response.headers()["cache-control"],"private, no-store");
 assert.equal((await page.request.get(endpoint+"?url=https://caller.example")).status(),400);
 assert.equal((await page.request.get(endpoint.replace("acc-a","acc-b"))).status(),404);
 await image.click();const dialog=page.getByRole("dialog");await dialog.waitFor();
 await page.waitForFunction(()=>{const img=document.querySelector('[role="dialog"] img');return img?.complete&&img.naturalWidth===96&&getComputedStyle(img).objectFit==="contain";});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"vault preview overflows mobile");
 if(process.env.ONLYFANS_TEST_EVIDENCE)await page.screenshot({path:path.join(process.env.ONLYFANS_TEST_EVIDENCE,"vault-preview-mobile.png"),fullPage:true});
 await dialog.getByRole("button",{name:"Close",exact:true}).click();await dialog.waitFor({state:"detached"});
 const absent=page.locator('[data-of-vault-image="12"]');await absent.scrollIntoViewIfNeeded();await absent.getByText("Preview unavailable",{exact:true}).waitFor();
 await context.clearCookies();assert.equal((await page.request.get(endpoint)).status(),401);
 await context.addCookies([{name:"allie_admin_session",value:process.env.ONLYFANS_TEST_COOKIE,url:origin}]);
 await page.setViewportSize({width:1440,height:1000});
 console.log("Vault previews PASS: real private image bytes, native dimensions, contain-fit expansion, explicit missing poster, scope/session refusal and mobile layout");
}

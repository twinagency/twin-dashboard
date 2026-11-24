const path = require("node:path"), { spawn } = require("node:child_process"), assert = require("node:assert/strict"), { randomBytes, createHmac } = require("node:crypto");
const local = "http://127.0.0.1:24657", api = "/creator-auth/telegram/feed", page = "/creator/telegram", fake = () => randomBytes(24).toString("hex");
const secret = fake(), ref = "lkmfwpqegjluirfusnaw";
const child = spawn(process.execPath, ["--require", path.join(__dirname, "test-fixtures.cjs"), path.join(__dirname, "dist/server.cjs")], { env: { TELEGRAM_FEED_PORT: "24657", FLIRT_LIVE_TWIN_ENABLED: "true", FLIRT_BACKEND_ENABLED: "true", FLIRT_SUPABASE_PROJECT_REF: ref, SUPABASE_URL: "https://" + ref + ".supabase.co", SUPABASE_SERVICE_KEY: "sb_secret_" + fake(), FLIRT_LIVE_TWIN_URL: "https://aouaenqayfltoqrmpitg.supabase.co", FLIRT_LIVE_TWIN_SERVICE_KEY: "sb_secret_" + fake(), CREATOR_SESSION_SECRET: secret, DASHBOARD_SESSION_SECRET: fake(), DASHBOARD_PASSWORD: fake(), DASHBOARD_PUBLIC_ORIGIN: "https://dashboard.example.com" }, stdio: ["ignore", "ignore", "inherit"] });
function sign(accountId) { const payload = Buffer.from(JSON.stringify({ accountId, userId: "example-user", exp: Date.now() + 30000 })).toString("base64url"); return payload + "." + createHmac("sha256", secret).update(payload).digest("base64url"); }
const token = sign("75df7b21-b83d-49c6-bf35-4d33fc68f80f");
const request = (path, token, method = "GET") => fetch(local + path, { redirect: "manual", headers: token ? { Cookie: "twin_creator_session=" + token } : {}, method });
(async () => {
    for (let i = 0; i < 70; i++) {
        try {
            await request("/");
            break;
        }
        catch {
            await new Promise(r => setTimeout(r, 40));
        }
    }
    assert.equal((await request("/")).status, 404);
    assert.equal((await request(page)).status, 303);
    assert.equal((await request(api)).status, 401);
    assert.equal((await request(api, token, "POST")).status, 405);
    assert.equal((await request(api, "bad", "HEAD")).status, 401);
    assert.equal((await request(api, sign("unentitled"), "HEAD")).status, 403);
    assert.equal((await request(api, token, "HEAD")).status, 204);
    assert.equal((await request(api + "?clone=wrong", token)).status, 400);
    const html = await request(page, token);
    assert.equal(html.status, 200);
    assert(html.headers.get("content-security-policy").includes("script-src 'nonce-"));
    const doc = await html.text();
    assert(doc.includes("telegram-feed"));
    assert(!doc.includes(token));
    assert(!doc.includes(secret));
    const list = await (await request(api, token)).json();
    assert.equal(list.conversations[0].id, "100");
    assert.equal(list.conversations[0].preview, "Example only.");
    const thread = await (await request(api + "?fan=100", token)).json();
    assert.equal(thread.messages[0].direction, "in");
    assert.equal((await (await request(api + "?fan=1234", token)).json()).messages.length, 0);
    const { JSDOM } = require("jsdom");
    const dom = new JSDOM(doc, { runScripts: "dangerously", url: local + page, pretendToBeVisual: true, beforeParse(win) { win.fetch = url => request(new URL(url).pathname + new URL(url).search, token); } });
    for (let i = 0; i < 50 && !dom.window.document.querySelector("li button"); i++)
        await new Promise(r => setTimeout(r, 20));
    const fan = dom.window.document.querySelector("li button");
    assert(fan?.textContent.includes("Example fan"));
    fan.click();
    for (let i = 0; i < 50 && !dom.window.document.querySelector("ol li"); i++)
        await new Promise(r => setTimeout(r, 20));
    assert(dom.window.document.querySelector("ol li").textContent.includes("Example only."));
    dom.window.close();
    console.log("Companion tests passed: private paths, methods, signed-out redirect, permission checks, feed, scoped transcript and rendered UI.");
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => child.kill());

// Operator proxy entry: formats are normalised, the login is never shown, and the result is always
// something the existing save contract (and so the backend) accepts. Synthetic hosts only.
// Run: npm run test:onlyfans-proxy
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeProxyInput, maskProxy, PROXY_RULE } from "../lib/onlyfans-connections/proxy";
import { validConnectionRequest } from "../lib/onlyfans-connections/contract";

const capture = { headers: { user_id: "123", user_agent: "Synthetic test agent", x_bc: "synthetic-bc", x_of_rev: "synthetic-rev" },
  signing: { rules: { static_param: "synthetic-static", start: "synthetic-start", end: "synthetic-end", checksum_indexes: Array(32).fill(1), checksum_constant: 1 } },
  cookies: [{ name: "sess", value: "synthetic-session", domain: ".onlyfans.com", path: "/" }] };
const save = (proxyUrl: string | null) => ({ action: "save" as const, expectedRevision: 0,
  payload: { ownerId: 123, capture, xHash: "synthetic-hash", proxyUrl, expiresAt: "2026-10-19T00:00:00Z", model: null } });
const url = (raw: string) => { const e = normalizeProxyInput(raw); assert(e.ok, `expected ok for ${raw}: ${e.ok ? "" : e.message}`); return e; };
const bad = (raw: string, pattern?: RegExp) => { const e = normalizeProxyInput(raw); assert.equal(e.ok, false, `expected refusal for ${raw}`); if (pattern && !e.ok) assert.match(e.message, pattern); };

// Every accepted shape normalises to one canonical URL that the real save contract accepts.
const canonical = "http://u1:p1@proxy.invalid:8080";
for (const raw of ["http://u1:p1@proxy.invalid:8080", "u1:p1@proxy.invalid:8080", "proxy.invalid:8080:u1:p1", "  http://u1:p1@proxy.invalid:8080/  ", "HTTP://u1:p1@proxy.invalid:8080"]) {
  const e = url(raw); assert.equal(e.url, canonical, raw); assert(validConnectionRequest(save(e.url)), raw);
}
assert.equal(url("proxy.invalid:8080").url, "http://proxy.invalid:8080");
assert.equal(url("socks5://u:p@proxy.invalid:1080").url, "socks5://u:p@proxy.invalid:1080");
assert.equal(url("socks5h://proxy.invalid:1080").url, "socks5h://proxy.invalid:1080");
assert.equal(url("https://u:p@proxy.invalid:443").url, "https://u:p@proxy.invalid:443");
assert.equal(url("[::1]:3128").url, "http://[::1]:3128");

// Special characters in the login are percent-encoded once, and an already encoded login is not double encoded.
assert.equal(url("http://us er:p@ss:w/rd@proxy.invalid:80".replace(" ", "")).url, "http://user:p%40ss%3Aw%2Frd@proxy.invalid:80");
assert.equal(url("user:p%40ss@proxy.invalid:80").url, "http://user:p%40ss@proxy.invalid:80");
assert.equal(url("proxy.invalid:80:user:pa:ss").url, "http://user:pa%3Ass@proxy.invalid:80");
for (const raw of ["user:p@ss@proxy.invalid:80", "proxy.invalid:80:user:p#?x"]) assert(validConnectionRequest(save(url(raw).url)), raw);

// Empty means no proxy, stated plainly, and the save contract takes null.
const none = url("   "); assert.equal(none.url, null); assert.match(none.masked, /No proxy/); assert(validConnectionRequest(save(none.url)));

// Refused input says why.
bad("ftp://proxy.invalid:21", /Only http, https, socks5/);
bad("proxy.invalid", /needs a port/);
bad("http://proxy.invalid", /needs a port/);
bad("proxy.invalid:0", /port must be/);
bad("proxy.invalid:65536", /port must be/);
bad("http://user@proxy.invalid:80", /user:password/);
bad("http://:pw@proxy.invalid:80", /user:password/);
bad("http://u:p@proxy.invalid:80/private", /needs a port/);
bad("two words:80"); bad("proxy.invalid:80:onlyuser"); bad("http://u:p@pro xy.invalid:80"); bad("ht tp://x:80"); bad("http://u:p@:80");
bad("http://u:p@proxy.invalid:80?x=1");
bad("http://u:\u00e9@proxy.invalid:80", /spaces or characters/);

// Masking: scheme, host and port stay; the login never appears in the preview.
const masked = url("http://alice:s3cretPass@proxy.invalid:8080").masked;
assert.equal(masked, "http://****:****@proxy.invalid:8080");
assert.equal(maskProxy("socks5h://proxy.invalid:1080"), "socks5h://proxy.invalid:1080");
for (const raw of ["alice:s3cretPass@proxy.invalid:8080", "proxy.invalid:8080:alice:s3cretPass"]) {
  const text = JSON.stringify(url(raw).masked); assert(!/alice|s3cretPass/.test(text), raw);
}
{ const e = normalizeProxyInput("http://alice:s3cretPass@proxy.invalid:99999"); assert(!e.ok && !/alice|s3cretPass/.test(e.message)); }

// The rule shown to the operator mentions the capture/proxy binding and the outgoing reset.
assert.match(PROXY_RULE, /capture is required/); assert.match(PROXY_RULE, /same proxy/); assert.match(PROXY_RULE, /switch off/);

// The editor wires the helper: the typed text is cleared with the other secrets, the field stays masked, the stored value is never read back.
const editor = readFileSync(new URL("../components/onlyfans-preview/ConnectionEditor.tsx", import.meta.url), "utf8");
assert.match(editor, /data-of-connection-proxy type="password"/);
assert.match(editor, /proxyUrl: proxyEntry\.url/);
assert.match(editor, /setProxy\(""\)/);
assert.match(editor, /!proxyEntry\.ok\}>Save credentials/);
assert.doesNotMatch(editor, /data\.proxy/);
console.log("onlyfans proxy checks passed");

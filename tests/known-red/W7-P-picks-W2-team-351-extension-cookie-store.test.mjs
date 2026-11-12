// KNOWN RED (W2 team-351-curl-capture F8, with F10/F11 which share the code; SOURCE-TEXT: reads the shipped zip, runs nothing).
// public/downloads/fastt-login-capture.zip ships a multi-account switcher: background.js snapshotCurrentAccount() writes every
// signed-in creator's full onlyfans.com cookie jar into chrome.storage.local.accounts (plain text, never expires), and a
// switchAccount handler restores stored jars (F11: answers ok:true after partial restore). The dashboard flow uses only
// "Copy curl". Fix (backend repo builds the zip): capture/export only, no stored cookie jars, no switcher, no `tabs` permission.
// Written by W7 P-picks. Needs the `unzip` binary; no network, no browser. Not wired into npm scripts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const zip = fileURLToPath(new URL("../../public/downloads/fastt-login-capture.zip", import.meta.url));
const entry = (name) => {
  const r = spawnSync("unzip", ["-p", zip, name], { encoding: "utf8" });
  assert.equal(r.status, 0, `unzip ${name}: ${r.stderr || r.error}`);
  return r.stdout;
};

test("control: the shipped extension is readable and still captures OnlyFans cookies for Copy curl", () => {
  const manifest = JSON.parse(entry("manifest.json"));
  assert.ok(manifest.permissions.includes("cookies"));
  assert.match(entry("background.js"), /chrome\.cookies\.getAll/);
});

test("F8: the shipped extension keeps no stored cookie jars and no account switcher", () => {
  const bg = entry("background.js"), manifest = JSON.parse(entry("manifest.json"));
  const found = [
    /chrome\.storage\.local\.set\(\{\s*accounts\b/.test(bg) && "storage.local.accounts written",
    /["']switchAccount["']/.test(bg) && "switchAccount handler",
    manifest.permissions.includes("tabs") && "tabs permission",
  ].filter(Boolean);
  assert.deepEqual(found, [], `shipped zip still has: ${found.join(", ")}`);
});

/**
 * Rule n (handover/TEAM-BRIEFING.md §7, REVIEW.md invariants 4 and 6): no OnlyFans credentials or session cookies, and
 * nothing key or token shaped, in fixtures, test data, scripts or logs. Scans every tracked and untracked (not ignored)
 * file under tests/, scripts/ and preview/, every path containing "fixture", and every *.log, for real-looking values.
 * Synthetic values (named synthetic/fixture/mock/test/..., or low entropy like "aaaa…") are allowed. Offline: git + fs only.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SELF = relative(ROOT, fileURLToPath(import.meta.url));
const IN_SCOPE = /^(tests|scripts|preview)\/|fixture|\.log$/i;
const BINARY = /\.(png|jpe?g|gif|webp|ico|mp4|mov|webm|woff2?|ttf|pdf|zip|gz)$/i;
const SYNTHETIC = /synthetic|fixture|mock|test|fake|dummy|example|invalid|redacted|placeholder|offline|not-a-secret|sample|\$\{|<[a-z_-]+>/i;

/** [name, pattern, index of the secret-bearing group]. Each pattern names an OnlyFans session field or a known key shape. */
const DETECTORS: Array<[string, RegExp, number]> = [
  ["OnlyFans session cookie", /\b(sess|auth_hash|auth_uniq_[a-z0-9]*)=([A-Za-z0-9%._-]{12,})/g, 2],
  ["OnlyFans auth_id cookie", /\bauth_id=([0-9]{5,})/g, 1],
  ["OnlyFans session field", /["']?\b(sess|auth_hash|auth_id|x-bc|xbc|app-token)["']?\s*[:=]\s*["'`]([^"'`\n]{6,})["'`]/gi, 2],
  ["Cookie header with an OnlyFans session", /\bcookie["']?\s*[:=]\s*["'`]([^"'`\n]*\b(?:sess|auth_id|auth_hash)=[^"'`\n]*)["'`]/gi, 1],
  ["OpenRouter key", /\bsk-or-v1-[A-Za-z0-9]{20,}/g, 0],
  ["Anthropic/OpenAI key", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/g, 0],
  ["Supabase secret", /\bsb_secret_[A-Za-z0-9_]{10,}/g, 0],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, 0],
  ["Telegram bot token", /\b[0-9]{8,10}:[A-Za-z0-9_-]{35}\b/g, 0],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g, 0],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 0],
];
const realLooking = (value: string) => value.startsWith("-----BEGIN") ||
  (!SYNTHETIC.test(value) && new Set(value.replace(/^(sk-or-v1-|sk-|sb_secret_|eyJ)/, "")).size >= 8);

export function findCredentials(text: string): string[] {
  const hits: string[] = [];
  for (const [name, pattern, group] of DETECTORS) for (const match of text.matchAll(pattern)) {
    const value = match[group] ?? match[0];
    const cookieValues = name.startsWith("Cookie header") ? [...value.matchAll(/\b(?:sess|auth_id|auth_hash)=([^;\s]+)/g)].map(m => m[1]) : [value];
    if (cookieValues.some(realLooking)) hits.push(`${name}: ${match[0].slice(0, 24)}…`);
  }
  return hits;
}

function files(): string[] {
  const list = (args: string[]) => execFileSync("git", ["ls-files", "-z", ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
  return [...new Set([...list([]), ...list(["--others", "--exclude-standard"])])]
    .filter(path => IN_SCOPE.test(path) && !BINARY.test(path) && path !== SELF)
    .filter(path => { try { const stat = statSync(`${ROOT}/${path}`); return stat.isFile() && stat.size < 4 * 1024 * 1024; } catch { return false; } });
}

test("the detector flags real-looking session values and passes synthetic ones", () => {
  const real = ["sess", "=", "k3j9x0qz7m2p5w8r1t4y6u0v"].join(""), id = ["auth", "_id=", "283746519"].join("");
  assert.ok(findCredentials(`headers: { Cookie: "${real}; ${id}" }`).length > 0, "a realistic OnlyFans cookie is caught");
  assert.ok(findCredentials(`"x-bc": "${"9f8e7d6c5b4a3210".repeat(2)}"`).length > 0, "a realistic x-bc header is caught");
  assert.deepEqual(findCredentials(`Cookie: "sess=synthetic-session-value; auth_id=11111"`), []);
  assert.deepEqual(findCredentials(`Authorization: "Bearer sb_secret_synthetic_transport_only"`), []);
});

test("no fixture, test, script, preview or log file holds an OnlyFans credential or a real key", () => {
  const scanned = files();
  assert.ok(scanned.length > 300, `the scan must cover the test and script tree (saw ${scanned.length} files)`);
  const leaks = scanned.flatMap(path => findCredentials(readFileSync(`${ROOT}/${path}`, "utf8")).map(hit => `${path}: ${hit}`));
  assert.deepEqual(leaks, []);
});

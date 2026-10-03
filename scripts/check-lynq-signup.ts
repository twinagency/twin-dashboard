import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { creatorSignupForward } from "../lib/creator-invite-forward";
import { inviteUrl } from "../lib/creator-invite-codes";
import { LYNQ_DASHBOARD_ORIGIN } from "../lib/form-origin";

Object.assign(process.env, { NODE_ENV: "production" });
delete process.env.DASHBOARD_PUBLIC_ORIGIN; delete process.env.DASHBOARD_EXTRA_ORIGINS;
const canonical = "https://dashboard.tgaiclone.xyz";
const req = (host: string) => ({ url: "https://dashboard.tgaiclone.xyz/creator/signup", headers: new Headers({ host }) });
const fwd = (host: string, slug: string | null | undefined, code: string | undefined, prod = true) => creatorSignupForward(req(host), slug, code, prod)?.toString() ?? null;

// Old tgaiclone Moxy invite goes to the Moxy host with the code
assert.equal(fwd("dashboard.tgaiclone.xyz", "moxy", "ABCD2345"), LYNQ_DASHBOARD_ORIGIN + "/creator/signup?code=ABCD2345");
// Already on the Moxy host: no loop
assert.equal(fwd("dashboard.lynqai.co", "moxy", "ABCD2345"), null);
// Generic and other-agency signups on tgaiclone are untouched
assert.equal(fwd("dashboard.tgaiclone.xyz", null, "ABCD2345"), null, "unknown or invalid code");
assert.equal(fwd("dashboard.tgaiclone.xyz", "tether", "ABCD2345"), null);
assert.equal(fwd("dashboard.tgaiclone.xyz", "someagency", "ABCD2345"), null);
assert.equal(fwd("dashboard.tgaiclone.xyz", "moxy", undefined), null, "no code");
// A non-Moxy invite opened on the Moxy host goes to the canonical host
assert.equal(fwd("dashboard.lynqai.co", "someagency", "ABCD2345"), canonical + "/creator/signup?code=ABCD2345");
// Spoofed or unknown hosts fall back to canonical behaviour, never to an arbitrary origin
assert.equal(fwd("evil.example", "moxy", "ABCD2345"), LYNQ_DASHBOARD_ORIGIN + "/creator/signup?code=ABCD2345");
assert.equal(fwd("evil.example", "someagency", "ABCD2345"), null);
// Dev/test never forwards
assert.equal(fwd("dashboard.tgaiclone.xyz", "moxy", "ABCD2345", false), null);
// Code is encoded
assert.ok(fwd("dashboard.tgaiclone.xyz", "moxy", "A B&C")!.endsWith("code=A+B%26C"));
// The invite URL the Moxy dashboard hands out is exactly what the site builds
assert.equal(inviteUrl(LYNQ_DASHBOARD_ORIGIN, "ABCD2345"), LYNQ_DASHBOARD_ORIGIN + "/creator/signup?code=ABCD2345");

// Source wiring: signup page forwards, signup errors keep the code, Moxy login links to the invite entry
const page = readFileSync("app/creator/signup/page.tsx", "utf8");
assert.ok(page.includes("creatorSignupForward") && page.includes("redirect(forward.toString())"));
const route = readFileSync("app/creator-auth/signup/route.ts", "utf8");
assert.ok(route.includes('url.searchParams.set("code", agencyCode)'));
const login = readFileSync("components/CreatorLoginScreen.tsx", "utf8");
assert.ok(login.includes('"https://lynqai.co/get-started"') && login.includes('invited?.slug === "moxy"'));
console.log("lynq signup checks passed");

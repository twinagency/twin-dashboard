import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import { CREATOR_SESSION_COOKIE, signCreatorSession } from "../lib/creator-session";

// FLIRT creators may skip every onboarding step and open the dashboard with
// nothing submitted, then come back to finish. Skipping never posts anything.
async function main() {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const { SkipToDashboard, OnboardingBanner } = await import("../components/FlirtOnboardingLinks");

  const skip = renderToStaticMarkup(<SkipToDashboard />);
  assert.match(skip, /<a [^>]*data-onboarding-skip-to-dashboard[^>]*>Skip to dashboard<\/a>/);
  assert.match(skip, /<a [^>]*href="\/creator"/, "Skip button is a plain GET link to the dashboard");
  assert.doesNotMatch(skip, /<form|type="submit"|\/creator-auth\//, "Skipping must not submit anything");
  assert.match(skip, /w-full/, "Skip button is full width on phones");

  const draftBanner = renderToStaticMarkup(<OnboardingBanner finished={false} />);
  assert.match(draftBanner, /<a [^>]*data-return-to-onboarding[^>]*>Finish onboarding</);
  assert.match(draftBanner, /data-finish-onboarding/);
  assert.match(draftBanner, /href="\/creator\/onboarding"/);
  const doneBanner = renderToStaticMarkup(<OnboardingBanner finished />);
  assert.match(doneBanner, /<a [^>]*data-return-to-onboarding[^>]*>Return to onboarding</);
  assert.doesNotMatch(doneBanner, /data-finish-onboarding/);

  // Wiring: the skip link is rendered for FLIRT only, before the step switch (every step), and the old
  // submitting "skip all" form is gone. Other brands keep the required-step flow.
  const page = readFileSync("app/creator/onboarding/page.tsx", "utf8");
  assert.match(page, /\{optional && !submitted && !applicationLocked && <SkipToDashboard \/>\}/);
  assert.ok(page.indexOf("<SkipToDashboard />") < page.indexOf("{!activeStep ? ("), "Skip is shown on the hub and on every step");
  assert.doesNotMatch(page, /Skip all and open dashboard/);
  const layout = readFileSync("app/creator/layout.tsx", "utf8");
  assert.match(layout, /onboardingEditable=\{flirtOnboardingOptional\(\) && !creator\.readOnly\}/, "Banner is FLIRT only");
  assert.match(layout, /onboardingFinished=\{creator\.onboarded\}/);

  // A draft FLIRT creator with no application, clone or submission reaches /creator.
  configureFlirtOfflineEnv();
  Object.assign(process.env, { FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw", SUPABASE_URL: "https://lkmfwpqegjluirfusnaw.supabase.co" });
  const accountId = "22222222-2222-4222-8222-222222222222";
  const userId = "11111111-1111-4111-8111-111111111111";
  const origin = "https://dashboard.flirt.example";
  const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  const writes: string[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.hostname, "lkmfwpqegjluirfusnaw.supabase.co");
    if (request.method !== "GET") writes.push(`${request.method} ${url.pathname}`);
    const table = url.pathname.replace("/rest/v1/", "");
    if (table === "creator_accounts") return json({ id: accountId, auth_user_id: userId, account_status: "applicant", source: "twin", display_name: "Offline fixture" });
    return json(null); // no application, assignment or clone link
  };
  try {
    const { middleware } = await import("../middleware");
    const { creatorDashboardIdentity } = await import("../lib/creator-dashboard-identity");
    const token = await signCreatorSession(accountId, userId);
    const identity = await creatorDashboardIdentity(token);
    assert.ok(identity && identity.onboarded === false && identity.cloneIds.length === 0, "Draft identity: not onboarded, no clone");
    for (const path of ["/creator", "/creator/onboarding"]) {
      const response = await middleware(new NextRequest(`${origin}${path}`, { headers: { cookie: `${CREATOR_SESSION_COOKIE}=${token}` } }));
      assert.equal(response.headers.get("x-middleware-next"), "1", `Draft FLIRT creator must open ${path}`);
    }
    assert.deepEqual(writes, [], "Opening the dashboard must not write anything");

    Object.assign(process.env, { FLIRT_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst", SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" });
    const strict = await middleware(new NextRequest(`${origin}/creator`, { headers: { cookie: `${CREATOR_SESSION_COOKIE}=${token}` } }));
    assert.ok(strict.headers.get("location")?.includes("/creator/onboarding"), "Other brands still require onboarding before the dashboard");
    console.log("FLIRT SKIP TO DASHBOARD PASSED: unsubmitted creator opens dashboard, skip link is a plain GET, finish banner while unsubmitted, no writes, strict runtimes unchanged.");
  } finally { globalThis.fetch = oldFetch; }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

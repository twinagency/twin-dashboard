import assert from "node:assert/strict";
import React from "react";
import { createRequire } from "node:module";
createRequire(process.cwd() + "/package.json").extensions[".css"] = module => { module.exports = {}; };
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import { creatorOnboardingEditable, creatorVoiceOnboardingEnabled, flirtOnboardingOptional } from "../lib/flirt-onboarding";
import { CREATOR_QUESTIONNAIRE_PAGES, questionnairePageQuestions } from "../lib/creator-questionnaire-draft";
import { COMPACT_QUESTIONNAIRE_PAGES } from "../lib/creator-questionnaire-compact";
import { FLIRT_QUESTIONNAIRE_PAGES } from "../lib/flirt-questionnaire";
import { CREATOR_SESSION_COOKIE, signCreatorSession } from "../lib/creator-session";

async function main() {
  assert.equal(flirtOnboardingOptional({}), false);
  assert.equal(flirtOnboardingOptional({ FLIRT_BACKEND_ENABLED: "true", FLIRT_SUPABASE_PROJECT_REF: "other" }), false);
  assert.equal(flirtOnboardingOptional({ FLIRT_BACKEND_ENABLED: "false", FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw" }), false);
  assert.equal(flirtOnboardingOptional({ FLIRT_BACKEND_ENABLED: "true", FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw" }), true);
  assert.equal(creatorVoiceOnboardingEnabled({}), true, "Other onboarding flows retain voice");
  assert.equal(creatorVoiceOnboardingEnabled({ FLIRT_BACKEND_ENABLED: "true", FLIRT_SUPABASE_PROJECT_REF: "other" }), true);
  assert.equal(creatorVoiceOnboardingEnabled({ FLIRT_BACKEND_ENABLED: "true", FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw" }), false, "FLIRT voice onboarding is temporarily hidden");

  for (const status of ["submitted", "reviewing", "approved"]) {
    assert.equal(creatorOnboardingEditable(status, true), true);
    assert.equal(creatorOnboardingEditable(status, false), false);
  }
  assert.equal(creatorOnboardingEditable("rejected", true), false);
  assert.equal(creatorOnboardingEditable("draft", false), true);

  // JSX in existing components may use the classic runtime under tsx.
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  const { default: Wizard } = await import("../components/CreatorQuestionnaireWizard");
  for (const page of CREATOR_QUESTIONNAIRE_PAGES) {
    const html = renderToStaticMarkup(<Wizard page={page} initialAnswers={Object.fromEntries(questionnairePageQuestions(page).map(({ id }) => [id, ""]))} initialRevision="" optional />);
    assert.doesNotMatch(html, /\srequired(?:=|\s|>)/, `${page.slug} must have no required fields`);
    assert.match(html, /data-onboarding-optional="true"/);
    assert.match(html, /Every answer is optional/);
  }
  const strictHtml = renderToStaticMarkup(<Wizard page={CREATOR_QUESTIONNAIRE_PAGES[0]} initialAnswers={{}} initialRevision="" />);
  for (const page of COMPACT_QUESTIONNAIRE_PAGES) {
    const html = renderToStaticMarkup(<Wizard page={page} initialAnswers={{}} initialRevision="" optional />);
    assert.doesNotMatch(html, /\srequired(?:=|\s|>)/, `${page.slug} must remain optional`);
    assert.match(html, /data-onboarding-optional="true"/);
    assert.match(html, /aria-label="Questionnaire progress"/, "Compact questionnaire retains progress without repeated optional copy");
  }
  for (const [index, page] of FLIRT_QUESTIONNAIRE_PAGES.entries()) {
    const html = renderToStaticMarkup(<Wizard page={page} initialAnswers={{}} initialRevision="" optional />);
    assert.match(html, new RegExp(`Step ${index + 1} of 4`));
    assert.doesNotMatch(html, /Skip questions/);
  }
  assert.match(strictHtml, /\srequired(?:=|\s|>)/, "Default questionnaire validation must remain unchanged");

  configureFlirtOfflineEnv();
  Object.assign(process.env, {
    FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw",
    SUPABASE_URL: "https://lkmfwpqegjluirfusnaw.supabase.co",
  });
  const accountId = "22222222-2222-4222-8222-222222222222";
  const userId = "11111111-1111-4111-8111-111111111111";
  const origin = "https://dashboard.flirt.example";
  type Row = Record<string, any>;
  let application = null as Row | null;
  let progress = null as Row | null;
  const consents: Row[] = [];
  const writes: { table: string; body: Row }[] = [];
  let applicationInserts = 0;
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.ok(["lkmfwpqegjluirfusnaw.supabase.co", "abcdefghijklmnopqrst.supabase.co"].includes(url.hostname), "All route calls must remain intercepted and offline");
    const table = url.pathname.replace("/rest/v1/", "");
    if (request.method === "GET") {
      if (table === "creator_accounts") {
        assert.equal(url.searchParams.get("id"), `eq.${accountId}`);
        return json({ id: accountId, auth_user_id: userId, account_status: "applicant", source: "twin", display_name: "Offline fixture" });
      }
      assert.equal(url.searchParams.get("creator_account_id"), `eq.${accountId}`, `${table} must be owner-scoped`);
      if (table === "creator_applications") return json(application);
      if (table === "creator_onboarding_progress") return json(progress);
      if (table === "creator_consents") return json(consents[0] || null);
      if (table === "creator_files") return json([]);
      if (table === "creator_agency_assignments" || table === "creator_clone_links") return json(null);
      throw new Error(`Unexpected read: ${table}`);
    }
    assert.ok(["creator_applications", "creator_onboarding_progress", "creator_consents"].includes(table), "Onboarding cannot activate a clone or change account access");
    const raw = await request.json();
    const body = Array.isArray(raw) ? raw[0] : raw;
    writes.push({ table, body });
    if (request.method === "PATCH") {
      assert.equal(table, "creator_applications");
      assert.equal(url.searchParams.get("creator_account_id"), `eq.${accountId}`);
      assert.equal(url.searchParams.get("status"), "eq.draft");
      if (!application || url.searchParams.get("updated_at") !== `eq.${application.updated_at}`) return json(null);
      application = { ...application, ...body };
      return json(application);
    }
    assert.equal(request.method, "POST");
    assert.equal(body.creator_account_id, accountId, "Posted foreign account IDs must be ignored");
    if (table === "creator_applications") {
      if (application) return json({ code: "23505" }, 409);
      application = { ...body };
      applicationInserts += 1;
      return json(application, 201);
    }
    if (table === "creator_onboarding_progress") { progress = { ...progress, ...body }; return json(progress, 201); }
    consents.push(body);
    return json(body, 201);
  };
  try {
    const { POST } = await import("../app/creator-auth/onboarding/route");
    const token = await signCreatorSession(accountId, userId);
    const post = async (action: string, fields: Record<string, string> = {}, authenticated = true) => {
      const request = new NextRequest(`${origin}/creator-auth/onboarding`, {
        method: "POST",
        headers: { origin, ...(authenticated ? { cookie: `${CREATOR_SESSION_COOKIE}=${token}` } : {}) },
        body: new URLSearchParams({ action, ...fields }),
      });
      return POST(request);
    };
    const location = (response: Response) => new URL(response.headers.get("location")!);

    const denied = await post("submit", {}, false);
    assert.equal(location(denied).pathname, "/creator/login");
    assert.equal(writes.length, 0, "No session means no mutations");

    const missing = await post("questionnaire", { revision: "" });
    assert.equal(location(missing).searchParams.get("status"), "questionnaire_missing");
    assert.equal(location(missing).searchParams.get("section"), "flirt-v3-account");
    assert.deepEqual(application?.answers, {});
    assert.equal(progress, null);
    assert.equal(application?.status, "draft");

    const completeAnswers = {
      date_of_birth: "1998-12-29", email_address: "test@example.com", phone_number: "+61411111111",
      flirt_social_profiles: "No public profiles", preferred_name: "Offline fixture", flirt_nickname: "No",
      from_grew_up: "Keep private", currently_live: "Keep private", flirt_languages: '[["English",""]]',
      flirt_relationship_status: "Keep private", flirt_siblings: "No", flirt_children: "No", flirt_pets: "No", flirt_marks: "No",
      flirt_hobbies: '[["Gym","Pilates"],["Gaming","Stardew Valley"]]',
      flirt_favourites: '[["Food","Pasta"],["Alcoholic drink","I don’t drink"]]',
      sexual_orientation: "Keep private", turn_ons_including_kinks: "None", turn_offs: "None", explicit_chat_allowed: "No", boundaries: "No",
    };
    if (!application) throw new Error("Expected a draft");
    application = { ...application, answers: { ...completeAnswers, flirt_hobbies: '[["Gym","Pilates"]]' } };
    const partial = await post("questionnaire", { revision: application!.updated_at });
    assert.equal(location(partial).searchParams.get("section"), "flirt-v3-interests");
    assert.equal(progress, null);

    application = { ...application, answers: completeAnswers };
    const questionnaire = await post("questionnaire", { revision: application!.updated_at });
    assert.equal(location(questionnaire).searchParams.get("status"), "questionnaire_saved");
    assert.equal(location(questionnaire).searchParams.get("step"), "content");
    assert.equal((progress as Row | null)?.questionnaire_completed, true);

    const conflict = await post("questionnaire", { revision: "stale-revision" });
    assert.equal(location(conflict).searchParams.get("status"), "questionnaire_conflict");
    const skippedConsent = await post("consent");
    assert.equal(location(skippedConsent).searchParams.get("status"), "consent_skipped");
    await post("consent", { legal_name: "Name without agreement" });
    await post("consent", { agreed: "on" });
    assert.equal(consents.length, 0, "Blank or partial consent cannot fabricate a signature");

    const submitted = await post("submit", { creator_account_id: "foreign-account" });
    assert.equal(location(submitted).pathname, "/creator");
    assert.equal(application?.status, "submitted");
    assert.deepEqual(application?.answers, completeAnswers);
    assert.equal(consents.length, 0);
    assert.equal((progress as Row | null)?.content_completed, undefined, "No fabricated uploaded-content completion");
    assert.equal((progress as Row | null)?.voice_completed, undefined, "Hidden voice must neither block submission nor invent voice completion");
    const insertsBefore = applicationInserts;
    await post("submit");
    assert.equal(applicationInserts, insertsBefore, "Repeated submission must be idempotent");
    const lateConsent = await post("consent", { legal_name: "Late update", agreed: "on" });
    assert.equal(location(lateConsent).searchParams.get("status"), "consent_saved", "FLIRT can complete consent after skipping intake");
    assert.equal(consents.length, 1);
    assert.equal(application?.status, "submitted", "Returning must not change approval status");
    await post("consent", { legal_name: "Do not replace", agreed: "on" });
    assert.equal(consents.length, 1, "Existing consent is not overwritten or duplicated");
    consents.length = 0;

    application = null as Row | null;
    progress = null as Row | null;
    const skipAll = await post("submit");
    assert.equal(location(skipAll).searchParams.get("status"), "questionnaire_missing");
    assert.equal(application, null, "A blank submission must not create an application");
    assert.equal(progress, null, "A blank submission must not create progress");
    assert.equal(consents.length, 0);

    application = { id: accountId, creator_account_id: accountId, status: "draft", answers: { full_name: "Previously saved" }, updated_at: "2026-01-01T00:00:00.000Z" };
    await post("submit");
    assert.deepEqual(application.answers, { full_name: "Previously saved" }, "Partial answers must survive rejected submission");

    Object.assign(process.env, { FLIRT_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst", SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" });
    application = { id: accountId, creator_account_id: accountId, status: "draft", answers: {}, updated_at: "2026-01-01T00:00:00.000Z" };
    const strict = await post("submit", { optional: "true" });
    assert.equal(location(strict).searchParams.get("status"), "not_ready", "Other runtimes must retain required checks, regardless of browser flags");
    assert.equal(application.status, "draft");

    console.log("FLIRT ONBOARDING PASSED: four-step validation, required questionnaire, retained draft answers, scoped writes and unchanged shared defaults.");
  } finally {
    globalThis.fetch = oldFetch;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });



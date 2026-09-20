"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadSharedServices } = require("./flirt-shared-services.cjs");

function withSecret(value, run) {
  const dir = mkdtempSync(join(tmpdir(), "flirt-shared-services-"));
  const file = join(dir, "providers.json");
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value), { mode: 0o600 });
  try { run(file); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const ref = "abcdefghijklmnopqrst";
function ready() {
  return {
    FLIRT_BACKEND_ENABLED: "true", FLIRT_SUPABASE_PROJECT_REF: ref,
    SUPABASE_URL: `https://${ref}.supabase.co`, SUPABASE_SERVICE_KEY: "sb_secret_synthetic",
    DASHBOARD_PUBLIC_ORIGIN: "https://flirt.example", NODE_ENV: "production",
    DASHBOARD_SESSION_SECRET: "a".repeat(48), CREATOR_SESSION_SECRET: "b".repeat(48),
    DASHBOARD_PASSWORD: "synthetic-test-password",
  };
}
function launch(file, env, code) {
  return spawnSync(process.execPath, ["--require", join(__dirname, "flirt-shared-services.cjs"), "-e", code], {
    cwd: __dirname, env: { ...env, FLIRT_SHARED_SERVICES_FILE: file }, encoding: "utf8",
  });
}

test("Node startup loads Twin provider keys while retaining FLIRT database and sessions", () => {
  withSecret({ OPENROUTER_API_KEY: "synthetic-shared-ai", ELEVENLABS_API_KEY: "synthetic-shared-voice", DEEPGRAM_API_KEY: "synthetic-shared-transcription" }, (file) => {
    const result = launch(file, ready(), `
      const assert = require('node:assert/strict');
      const { assertStartup } = require('./flirt-environment.cjs');
      assert.equal(assertStartup('dashboard'), '${ref}');
      assert.equal(assertStartup('bot'), '${ref}');
      assert.equal(process.env.OPENROUTER_API_KEY, 'synthetic-shared-ai');
      assert.equal(process.env.ELEVENLABS_API_KEY, 'synthetic-shared-voice');
      assert.equal(process.env.DEEPGRAM_API_KEY, 'synthetic-shared-transcription');
      assert.equal(process.env.SUPABASE_URL, 'https://${ref}.supabase.co');
      assert.equal(process.env.CREATOR_SESSION_SECRET, 'b'.repeat(48));
    `);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  });
});
test("shared provider keys never permit the FLIRT runtime to use Twin customer data", () => {
  withSecret({ OPENROUTER_API_KEY: "synthetic-shared-ai" }, (file) => {
    for (const twinRef of ["aouaenqayfltoqrmpitg", "cnnsllgzskqkvdovyiiv"]) {
      const result = launch(file, { ...ready(), FLIRT_SUPABASE_PROJECT_REF: twinRef, SUPABASE_URL: `https://${twinRef}.supabase.co` }, "require('./flirt-environment.cjs').assertStartup('bot')");
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /separate FLIRT project/);
      assert.doesNotMatch(result.stderr, /synthetic-shared-ai/);
    }
  });
});
test("shared file cannot overwrite database, session, bot identity or activation settings", () => {
  for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "DATABASE_URL", "BOT_TOKEN", "CREATOR_SESSION_SECRET", "FLIRT_BACKEND_ENABLED", "NODE_OPTIONS", "__proto__"]) {
    withSecret({ OPENROUTER_API_KEY: "synthetic-shared-ai", [key]: "must-not-leak" }, (file) => {
      const env = { ...ready(), FLIRT_SHARED_SERVICES_FILE: file };
      const before = { ...env };
      assert.throws(() => loadSharedServices(env), /FLIRT shared services/);
      assert.deepEqual(env, before);
    });
  }
});
test("shared file is optional and explicit app credentials retain precedence", () => {
  const env = { OPENROUTER_API_KEY: "explicit-app-value" };
  loadSharedServices(env);
  withSecret({ OPENROUTER_API_KEY: "synthetic-shared-ai", ELEVENLABS_API_KEY: "synthetic-shared-voice" }, (file) => {
    env.FLIRT_SHARED_SERVICES_FILE = file;
    loadSharedServices(env);
    assert.equal(env.OPENROUTER_API_KEY, "explicit-app-value");
    assert.equal(env.ELEVENLABS_API_KEY, "synthetic-shared-voice");
  });
});
test("malformed or missing configured files fail before application execution without logging values", () => {
  for (const value of ["bad-json-secret", "null", "[]", "{}", '{"OPENROUTER_API_KEY":null}', '{"OPENROUTER_API_KEY":""}', '{"OPENROUTER_API_KEY":"bad\\nsecret"}', ' '.repeat(17000)]) {
    withSecret(value, (file) => {
      const result = launch(file, ready(), "console.log('APPLICATION_STARTED')");
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(result.stdout + result.stderr, /APPLICATION_STARTED|bad-json-secret/);
    });
  }
  assert.throws(() => loadSharedServices({ FLIRT_SHARED_SERVICES_FILE: "relative.json" }));
  assert.throws(() => loadSharedServices({ FLIRT_SHARED_SERVICES_FILE: "/missing/flirt-provider-file.json" }));
});

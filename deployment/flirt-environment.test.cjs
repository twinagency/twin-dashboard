"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { assertDatabase, assertStartup, assertBotConfig } = require("./flirt-environment.cjs");

// Synthetic values only. The checks never contact a service.
const ref = "abcdefghijklmnopqrst";
const ready = () => ({
  FLIRT_BACKEND_ENABLED: "true",
  FLIRT_SUPABASE_PROJECT_REF: ref,
  SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_SERVICE_KEY: "sb_secret_synthetic_test_only",
  DASHBOARD_PUBLIC_ORIGIN: "https://dashboard.flirt.example",
  DASHBOARD_SESSION_SECRET: "a".repeat(48),
  CREATOR_SESSION_SECRET: "b".repeat(48),
  DASHBOARD_PASSWORD: "synthetic-password-only",
  NODE_ENV: "production",
});
const jwt = (ref, role = "service_role") => `header.${Buffer.from(JSON.stringify({ ref, role })).toString("base64url")}.signature`;

test("accepts a separately configured dashboard and bot", () => {
  assert.equal(assertStartup("dashboard", ready()), ref);
  assert.equal(assertStartup("bot", ready()), ref);
});
test("disabled runtime refuses startup", () => {
  assert.throws(() => assertStartup("dashboard", { ...ready(), FLIRT_BACKEND_ENABLED: "false" }), /disabled/);
});
test("blocks current and legacy Twin projects even if all fields match", () => {
  for (const ref of ["aouaenqayfltoqrmpitg", "cnnsllgzskqkvdovyiiv"]) {
    assert.throws(() => assertDatabase({ ...ready(), FLIRT_SUPABASE_PROJECT_REF: ref, SUPABASE_URL: `https://${ref}.supabase.co` }), /separate FLIRT project/);
  }
});
test("rejects mismatched, lookalike, credential-bearing and insecure API URLs", () => {
  for (const url of ["https://aouaenqayfltoqrmpitg.supabase.co", `https://${ref}.supabase.co.evil.example`,
    `http://${ref}.supabase.co`, `https://user:password@${ref}.supabase.co`, `https://${ref}.supabase.co/other`]) {
    assert.throws(() => assertDatabase({ ...ready(), SUPABASE_URL: url }), /exactly/);
  }
});
test("rejects absent credentials and foreign or non-service JWTs", () => {
  for (const key of ["", "invalid", jwt("aouaenqayfltoqrmpitg"), jwt(ref, "anon")]) {
    assert.throws(() => assertDatabase({ ...ready(), SUPABASE_SERVICE_KEY: key }));
  }
  assert.equal(assertDatabase({ ...ready(), SUPABASE_SERVICE_KEY: jwt(ref) }), ref);
});
test("validates direct and pooler Postgres targets", () => {
  for (const url of [`postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres?sslmode=require`,
    `postgresql://postgres.${ref}:secret@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres`]) {
    assert.equal(assertDatabase({ ...ready(), DATABASE_URL: url }), ref);
  }
  for (const url of ["postgresql://postgres:secret@db.aouaenqayfltoqrmpitg.supabase.co/postgres",
    `postgresql://postgres.wrongref:secret@aws-1-ap-southeast-2.pooler.supabase.com/postgres`,
    `postgresql://postgres.${ref}:secret@evil.example/postgres`,
    `postgresql://postgres:secret@db.${ref}.supabase.co/postgres?host=evil.example`]) {
    assert.throws(() => assertDatabase({ ...ready(), DATABASE_URL: url }));
  }
});
test("rejects Twin redirects, missing origins and HTTP production origins", () => {
  for (const origin of ["", "https://dashboard.tgaiclone.xyz", "https://twinagency.co", "http://dashboard.flirt.example", "https://dashboard.flirt.example/wrong"]) {
    assert.throws(() => assertStartup("dashboard", { ...ready(), DASHBOARD_PUBLIC_ORIGIN: origin }));
  }
  assert.equal(assertStartup("dashboard", { ...ready(), NODE_ENV: "development", DASHBOARD_PUBLIC_ORIGIN: "http://localhost:3001" }), ref);
});
test("requires separate creator and operator signing secrets", () => {
  for (const change of [{ CREATOR_SESSION_SECRET: "" }, { DASHBOARD_SESSION_SECRET: "short" },
    { CREATOR_SESSION_SECRET: "a".repeat(48) }, { DASHBOARD_PASSWORD: "" }]) {
    assert.throws(() => assertStartup("dashboard", { ...ready(), ...change }));
  }
});
test("rejects inherited publishable keys and frontend URL drift", () => {
  assert.throws(() => assertDatabase({ ...ready(), SUPABASE_PUBLISHABLE_KEY: "sb_publishable_GaunWyo_PKF82PDziCc9mQ_B9_3O16a" }), /inherited/);
  assert.throws(() => assertDatabase({ ...ready(), NEXT_PUBLIC_SUPABASE_URL: "https://aouaenqayfltoqrmpitg.supabase.co" }), /differs/);
  assert.throws(() => assertDatabase({ ...ready(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_example" }), /server secrets/);
});
test("allows unconfigured offline bot tests, but configured services require activation", () => {
  assert.doesNotThrow(() => assertBotConfig({}));
  assert.doesNotThrow(() => assertBotConfig({ MOCK: "true" }));
  for (const env of [{ MOCK: "false" }, { MOCK: "true", BOT_TOKEN: "test" }, { DATABASE_URL: "test" }]) {
    assert.throws(() => assertBotConfig(env), /disabled/);
  }
});
test("startup CLI exits nonzero before application launch, without leaking credentials", () => {
  const result = spawnSync(process.execPath, [join(__dirname, "flirt-preflight.cjs"), "dashboard"], {
    env: { ...ready(), FLIRT_BACKEND_ENABLED: "false" }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /disabled/);
  assert.doesNotMatch(result.stderr, /synthetic-password|sb_secret/);
});

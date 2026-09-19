"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { publicAuthConfig } = require("./flirt-public-auth.cjs");
const ref = "abcdefghijklmnopqrst";
const config = { ref, url: `https://${ref}.supabase.co`, key: "sb_publishable_synthetic_test_only" };
const jwt = (ref, role) => `header.${Buffer.from(JSON.stringify({ ref, role })).toString("base64url")}.signature`;

test("recovery accepts only explicit independent public credentials", () => {
  assert.equal(publicAuthConfig(config).storageKey, `flirt-creator-auth-${ref}`);
  assert.equal(publicAuthConfig({ ...config, key: jwt(ref, "anon") }).url, config.url);
  assert.throws(() => publicAuthConfig({}));
  for (const old of ["aouaenqayfltoqrmpitg", "cnnsllgzskqkvdovyiiv"]) {
    assert.throws(() => publicAuthConfig({ ...config, ref: old, url: `https://${old}.supabase.co` }));
  }
});
test("recovery rejects secrets, foreign keys and lookalike URLs", () => {
  for (const key of ["sb_secret_never_public", jwt(ref, "service_role"), jwt("aouaenqayfltoqrmpitg", "anon"), "sb_publishable_GaunWyo_PKF82PDziCc9mQ_B9_3O16a"]) {
    assert.throws(() => publicAuthConfig({ ...config, key }));
  }
  for (const url of [`http://${ref}.supabase.co`, `${config.url}.evil.example`, `${config.url}/auth`, "https://aouaenqayfltoqrmpitg.supabase.co"]) {
    assert.throws(() => publicAuthConfig({ ...config, url }));
  }
});
test("both recovery screens use the guarded client instead of an embedded project", () => {
  for (const file of ["CreatorForgotPasswordScreen.tsx", "CreatorResetPasswordScreen.tsx"]) {
    const source = readFileSync(join(__dirname, "../components", file), "utf8");
    assert.match(source, /creatorBrowserAuth\(/);
    assert.doesNotMatch(source, /createClient\(|\.supabase\.co|sb_publishable_/);
  }
});

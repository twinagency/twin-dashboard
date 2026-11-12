/**
 * W4 lib-onlyfans-preview-1 C3 (REVIEW inv 7 isolation, no credentials): lib/onlyfans-preview/avatar.ts decides which
 * image URL a live OnlyFans screen may ask the browser to load. Only https, no userinfo, no explicit port, on an
 * OnlyFans-owned host or a real subdomain of one. A broken image falls back provider -> portrait -> initials, and the
 * failure memory is keyed by id + URL, never by display name. Pure string checks; nothing here fetches a URL.
 * Characterization, green at HEAD; mutation proofs in tests/rules/mutations/W4-lib-onlyfans-preview-1/.
 * Bare onlyfans.com + any subdomain admitted: W3 guess, cited in the findings file, not pinned here.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { avatarFailureKey, isVerifiedProviderAvatar, resolveAvatarSource } from "../../lib/onlyfans-preview/avatar";

const GOOD = "https://public.onlyfans.com/x.jpg";
const PORTRAIT = "/portraits/ava.jpg";

test("isVerifiedProviderAvatar: accepts https on an OnlyFans subdomain", () => {
  assert.equal(isVerifiedProviderAvatar(GOOD), true);
  assert.equal(isVerifiedProviderAvatar("https://cdn2.ofusercontent.com/a/b.jpg"), true);
});

test("isVerifiedProviderAvatar: rejects http, userinfo, explicit port, look-alike hosts and garbage", () => {
  const rejected = [
    "http://public.onlyfans.com/x.jpg",
    "https://avatar@public.onlyfans.com/x.jpg",
    "https://avatar:x@public.onlyfans.com/x.jpg",
    "https://:x@public.onlyfans.com/x.jpg",
    "https://public.onlyfans.com:8443/x.jpg",
    "https://evilonlyfans.com/x.jpg",
    "https://onlyfans.com.evil.com/x.jpg",
    "javascript:alert(1)",
    "//public.onlyfans.com/x.jpg",
    "not a url",
    "",
    null,
    undefined,
  ];
  for (const url of rejected) assert.equal(isVerifiedProviderAvatar(url), false, String(url));
});

test("resolveAvatarSource: provider, then portrait, then initials as each URL fails for this id", () => {
  const id = "fan-8001";
  assert.deepEqual(resolveAvatarSource({ id, providerUrl: GOOD, portraitUrl: PORTRAIT, failed: [] }), { kind: "provider", url: GOOD });
  const providerFailed = [avatarFailureKey(id, GOOD)];
  assert.deepEqual(resolveAvatarSource({ id, providerUrl: GOOD, portraitUrl: PORTRAIT, failed: providerFailed }), { kind: "portrait", url: PORTRAIT });
  const bothFailed = [...providerFailed, avatarFailureKey(id, PORTRAIT)];
  assert.deepEqual(resolveAvatarSource({ id, providerUrl: GOOD, portraitUrl: PORTRAIT, failed: bothFailed }), { kind: "initials" });
  assert.deepEqual(resolveAvatarSource({ id, providerUrl: "http://public.onlyfans.com/x.jpg", portraitUrl: PORTRAIT, failed: [] }), { kind: "portrait", url: PORTRAIT });
  assert.deepEqual(resolveAvatarSource({ id, providerUrl: null, portraitUrl: null, failed: [] }), { kind: "initials" });
});

test("resolveAvatarSource: a failure for another id, another URL or a display name never applies", () => {
  const id = "fan-8001";
  const failed = [avatarFailureKey("fan-8002", GOOD), avatarFailureKey(id, "https://public.onlyfans.com/old.jpg"), avatarFailureKey("Ava Hart", GOOD), "Ava Hart", GOOD];
  assert.deepEqual(resolveAvatarSource({ id, providerUrl: GOOD, portraitUrl: PORTRAIT, failed }), { kind: "provider", url: GOOD });
  assert.notEqual(avatarFailureKey("fan-8001", GOOD), avatarFailureKey("fan-8002", GOOD));
});

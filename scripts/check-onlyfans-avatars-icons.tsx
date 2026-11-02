import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { avatarFailureKey, initialsFor, isVerifiedProviderAvatar, resolveAvatarSource } from "../lib/onlyfans-preview/avatar";
import { accounts } from "../lib/onlyfans-preview/fixtures";

async function main() {
  (globalThis as unknown as { React: typeof React }).React = React;
  const requireNative = createRequire(import.meta.url);
  requireNative.extensions[".css"] = module => { module.exports = {}; };
  const { default: PlatformIcon } = await import("../components/PlatformIcon");
  const { default: CreatorPortrait, OnlyFansPortraitProvider } = await import("../components/onlyfans-preview/CreatorPortrait");

  for (const platform of ["telegram", "onlyfans", "all"] as const) {
    const markup = renderToStaticMarkup(<PlatformIcon platform={platform} size={22} />);
    assert.match(markup, /^<svg /); assert.doesNotMatch(markup, /<img|src=|href=/);
    assert.match(markup, /width="22"/); assert.match(markup, /height="22"/);
    assert.match(markup, /aria-hidden="true"/); assert.match(markup, /flex-shrink:0/);
  }
  assert.match(renderToStaticMarkup(<PlatformIcon platform="onlyfans" />), /width="20"/);

  const photo = "https://public.onlyfans.com/files/a/avatar.jpg";
  const portrait = "https://example.supabase.co/signed/portrait.jpg";
  const overview = (providerAvatarUrl: string | null, photoUrl?: string) => renderToStaticMarkup(
    <OnlyFansPortraitProvider creators={photoUrl ? [{ id: "c1", name: "Maile Rose", photoUrl }] : []}>
      <CreatorPortrait creatorId="c1" name="Maile Rose" providerAvatarUrl={providerAvatarUrl} />
    </OnlyFansPortraitProvider>);
  assert.match(overview(photo), new RegExp(`<img src="${photo.replace(/\./g, "\\.")}"`));
  assert.match(overview(null, portrait), /<img src="https:\/\/example\.supabase\.co\/signed\/portrait\.jpg"/);
  const initials = overview(null);
  assert.doesNotMatch(initials, /<img/); assert.match(initials, /<span>MR<\/span>/);
  assert.doesNotMatch(overview("https://evil.example/a.jpg"), /evil\.example/, "unverified hosts never reach the browser");

  assert.equal(isVerifiedProviderAvatar("http://cdn.onlyfans.com/a.jpg"), false);
  assert.equal(isVerifiedProviderAvatar("https://cdn.onlyfans.com:8443/a.jpg"), false);
  assert.equal(isVerifiedProviderAvatar("https://onlyfans.com.evil.test/a.jpg"), false);
  assert.equal(isVerifiedProviderAvatar("https://a.ofusercontent.com/a.jpg"), true);

  // Fallback happens once per id+url and resets when either changes.
  const failedProvider = [avatarFailureKey("c1", photo)];
  assert.deepEqual(resolveAvatarSource({ id: "c1", providerUrl: photo, portraitUrl: portrait, failed: failedProvider }), { kind: "portrait", url: portrait });
  assert.deepEqual(resolveAvatarSource({ id: "c1", providerUrl: photo, portraitUrl: null, failed: failedProvider }), { kind: "initials" });
  assert.deepEqual(resolveAvatarSource({ id: "c2", providerUrl: photo, portraitUrl: null, failed: failedProvider }), { kind: "provider", url: photo }, "another id starts clean");
  const fresh = "https://public.onlyfans.com/files/b/avatar.jpg";
  assert.deepEqual(resolveAvatarSource({ id: "c1", providerUrl: fresh, portraitUrl: null, failed: failedProvider }), { kind: "provider", url: fresh }, "a new URL starts clean");
  assert.equal(initialsFor("  "), "OF"); assert.equal(initialsFor("ann lee smith"), "AL");
  assert.ok(accounts.length > 0);
  console.log("onlyfans avatar and icon checks passed");
}
main().catch(error => { console.error(error); process.exit(1); });

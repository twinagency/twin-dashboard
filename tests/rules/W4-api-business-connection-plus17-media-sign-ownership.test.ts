/**
 * W4 api-business-connection-plus17 C1 (F16 HOLDS): /api/media-sign signs a `path` for an agency or creator login only
 * when that login owns the media. The rule is not in the route: app/api/media-sign/route.ts signs through supabaseAdmin,
 * whose transport (lib/supabase.ts -> lib/agency-fetch.ts dashboardFetch) refuses a sign request unless ownsMedia finds
 * the path among the viewer's own clones' photos, videos, photo bundle items or profile images (clones.intake)
 * (lib/agency-fetch.ts:16-33,92-96). Each source gets a foreign-clone case: clone B's real media requested by clone A's login.
 * Only the wire is faked: PostgREST answers from in-memory rows honouring every filter, Storage answers the sign POST.
 * Mutation proofs: tests/rules/mutations/W4-api-business-connection-plus17/c1-*.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { agency, as, CLONE_A, CLONE_B, creator, isRest, json, SIGN_PATH, SUPABASE_HOST, table, withWire, type Call } from "./W4-api-business-connection-plus17-helpers";
import type { AgencyIdentity } from "../../lib/agency-identity";
import { GET } from "../../app/api/media-sign/route";

const media = (clone: string, name: string) => `clones/${clone}/${name}`;
const PHOTOS = [{ clone_id: CLONE_A, storage_path: media(CLONE_A, "photo-1.jpg") }, { clone_id: CLONE_B, storage_path: media(CLONE_B, "photo-9.jpg") }];
const VIDEOS = [{ clone_id: CLONE_A, storage_path: media(CLONE_A, "video-1.mp4") }, { clone_id: CLONE_B, storage_path: media(CLONE_B, "video-9.mp4") }];
const BUNDLES = [
  { clone_id: CLONE_A, photo_bundle_items: [{ storage_path: media(CLONE_A, "bundle-1.jpg") }] },
  { clone_id: CLONE_B, photo_bundle_items: [{ storage_path: media(CLONE_B, "bundle-9.jpg") }] },
];
const CLONES = [
  { id: CLONE_A, intake: { appearance: { profile_image_path: media(CLONE_A, "profile.jpg") } } },
  { id: CLONE_B, intake: { appearance: { profile_image_path: media(CLONE_B, "profile.jpg") } } },
];

const wire = (c: Call) => {
  if (isRest(c, "photos")) return table(PHOTOS, c);
  if (isRest(c, "videos")) return table(VIDEOS, c);
  if (isRest(c, "photo_bundles")) return table(BUNDLES, c);
  if (isRest(c, "clones")) return table(CLONES, c);
  if (c.url.hostname === SUPABASE_HOST && SIGN_PATH.test(c.url.pathname) && c.method === "POST") {
    return json({ signedURL: `${c.url.pathname.replace("/storage/v1", "")}?sig=synthetic-signature` });
  }
  return undefined;
};
async function sign(viewer: AgencyIdentity, path: string) {
  return withWire(wire, async stub => {
    const res = await as(viewer, () => GET(new NextRequest(`http://localhost/api/media-sign?path=${encodeURIComponent(path)}`)));
    const body = await res.json() as { url?: string };
    return { status: res.status, body, signCalls: stub.to(SUPABASE_HOST, SIGN_PATH).length };
  });
}
async function refused(viewer: AgencyIdentity, path: string) {
  const r = await sign(viewer, path);
  assert.notEqual(r.status, 200, `${path} answered 200`);
  assert.equal(r.body.url, undefined, `a signed URL was returned for ${path}`);
  assert.equal(r.signCalls, 0, `the Storage sign endpoint was called for ${path}`);
}

test("agency: another clone's photo path is refused with zero Storage sign calls", async () => {
  await refused(agency([CLONE_A]), media(CLONE_B, "photo-9.jpg"));
});

test("agency: another clone's video path is refused with zero Storage sign calls", async () => {
  await refused(agency([CLONE_A]), media(CLONE_B, "video-9.mp4"));
});

test("agency: another clone's photo bundle item path is refused with zero Storage sign calls", async () => {
  await refused(agency([CLONE_A]), media(CLONE_B, "bundle-9.jpg"));
});

test("agency: another clone's profile image path is refused with zero Storage sign calls", async () => {
  await refused(agency([CLONE_A]), media(CLONE_B, "profile.jpg"));
});

test("agency: a path no ownership lookup returns is refused with zero Storage sign calls", async () => {
  await refused(agency([CLONE_A]), media(CLONE_A, "not-in-any-table.jpg"));
});

test("creator: another clone's photo path is refused with zero Storage sign calls", async () => {
  await refused(creator([CLONE_A]), media(CLONE_B, "photo-9.jpg"));
});

test("agency: its own clone's photo, video, bundle item and profile image are each signed (200, one sign call, that path)", async () => {
  for (const name of ["photo-1.jpg", "video-1.mp4", "bundle-1.jpg", "profile.jpg"]) {
    const path = media(CLONE_A, name);
    const r = await sign(agency([CLONE_A]), path);
    assert.equal(r.status, 200, `${path} answered ${r.status}`);
    assert.equal(r.signCalls, 1);
    assert.ok(r.body.url?.includes(path), `url ${r.body.url} is not for ${path}`);
  }
});

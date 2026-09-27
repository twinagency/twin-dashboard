import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { agencyIdentityById } from "../lib/agency-identity";
import { withDashboardAccess } from "../lib/dashboard-access";
import { JESS_KATE_PORTAL } from "../lib/partner-portals";
import { supabaseAdmin } from "../lib/supabase";
import { GET as dashboard } from "../app/api/dashboard/route";
import { GET as mediaSign } from "../app/api/media-sign/route";
import { scopeAgencyWrite } from "../lib/agency-write";

async function main() {
  // Read-only production check. Resolve the live roster and exercise the same
  // scoped routes used by the agency. No session, credential, or URL is logged.
  const identity = await agencyIdentityById(JESS_KATE_PORTAL.id);
  assert.ok(identity, "Agency identity unavailable");
  const clone = "02a49e27-606d-4f20-9472-fab39255753f";
  assert.ok(identity.cloneIds.includes(clone), "Creator assignment missing");
  await withDashboardAccess(identity, async () => {
    const started = Date.now();
    const response = await dashboard(new NextRequest(`https://dashboard.tgaiclone.xyz/api/dashboard?period=2W&clone=${clone}&fresh=force`));
    assert.equal(response.status, 200, "Earnings route failed");
    const data = await response.json();
    assert.ok(Number.isFinite(data.totals?.stars), "Missing earnings total");
    assert.ok(data.analytics && !data.analyticsError, "Detailed analytics failed");
    assert.ok(data.clones.length === 1 && data.clones[0].id === clone, "Earnings scope mismatch");
    assert.ok(data.analytics.clones.every((item: {id:string}) => item.id === clone), "Analytics scope mismatch");
    assert.ok(!("costUsd" in data.totals), "Internal costs exposed");
    console.log(`Live 2W earnings and analytics passed in ${Date.now() - started}ms; creator scope and cost redaction passed`);

    const photos = await supabaseAdmin.from("photos").select("storage_path").eq("clone_id", clone).limit(20);
    assert.ok(!photos.error && photos.data?.length, "Photo inventory unavailable");
    let verified = 0;
    for (const photo of photos.data!) {
      const signed = await mediaSign(new NextRequest(`https://dashboard.tgaiclone.xyz/api/media-sign?path=${encodeURIComponent(photo.storage_path)}`));
      assert.equal(signed.status, 200, "Signing failed");
      assert.equal(signed.headers.get("cache-control"), "private, no-store");
      const body = await signed.json();
      assert.ok(body.expiresAt > Date.now());
      const image = await fetch(body.url, { signal: AbortSignal.timeout(15_000) });
      assert.ok(image.ok, "Image delivery failed");
      const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
      assert.ok(metadata.width && metadata.height, "Image decoding failed");
      verified++;
    }
    // Validate the real upload payload without creating a production media row.
    const url = new URL("https://example.supabase.co/rest/v1/photos");
    const payload = { clone_id: clone, storage_path: `${clone}/photos/validation.jpg`, caption: "Internal metadata", visual_description: "Internal metadata", teaser_caption: null, star_value: 400, image_name: "validation.jpg", is_free: false, is_nude: false, explicitness: "none", nsfw: false, tags: [], auto_desc: null };
    await scopeAgencyWrite(url, "POST", payload, identity);
    await assert.rejects(scopeAgencyWrite(url, "POST", {...payload, clone_id: "00000000-0000-0000-0000-000000000001"}, identity));
    console.log(`Live media: ${verified} signed images delivered and decoded; upload payload accepted; other creator rejected`);
  });
}
if (process.env.DASHBOARD_RECOVERY_CHECK_LOAD_ONLY !== "1") {
  const timeout = setTimeout(() => { console.error("Dashboard recovery check timed out"); process.exit(1); }, 120_000);
  main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : "Dashboard recovery check failed"); process.exitCode = 1; }).finally(() => clearTimeout(timeout));
}

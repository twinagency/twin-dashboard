import { getAgencyOverview } from "../lib/agency-overview";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { agencyIdentityById } from "../lib/agency-identity";
import { withDashboardAccess } from "../lib/dashboard-access";
import { JESS_KATE_PORTAL } from "../lib/partner-portals";
import { MOXY_MANAGEMENT_AGENCY_ID } from "../lib/agency-management-policy";
import { supabaseAdmin } from "../lib/supabase";
import { GET as dashboard } from "../app/api/dashboard/route";
import { GET as mediaSign } from "../app/api/media-sign/route";
import { scopeAgencyWrite } from "../lib/agency-write";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RevenueDashboard from "../components/RevenueDashboard";
import DashboardAccessProvider from "../components/DashboardAccessProvider";

async function main() {

  const moxy = await agencyIdentityById(MOXY_MANAGEMENT_AGENCY_ID);
  assert.ok(moxy && moxy.cloneIds.length, "Moxy creator assignments unavailable");
  await withDashboardAccess(moxy, async () => {
    const overview = await getAgencyOverview();
    assert.deepEqual(overview.map(c => c.id).sort(), [...moxy.cloneIds].sort(), "Overview roster must match authorized creators");
    for (const creator of overview) {
      assert.ok(Number.isInteger(creator.fans) && creator.fans >= 0, "Real audience count missing");
      if (creator.photoId) {
        assert.ok(creator.photoUrl, "Configured portrait could not be signed");
        const image = await fetch(creator.photoUrl!, { signal: AbortSignal.timeout(15000) });
        assert.ok(image.ok, "Private creator portrait unavailable");
        const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
        assert.ok(metadata.width && metadata.height, "Invalid creator portrait");
      }
    }
    const earnings = await dashboard(new NextRequest("https://dashboard.lynqai.co/api/dashboard?period=1M&fresh=1"));
    const snapshot = await earnings.json();
    assert.equal(earnings.status, 200, "Moxy overview earnings failed");
    assert.ok(snapshot.clones.every((c: {id:string}) => moxy.cloneIds.includes(c.id)), "Overview earnings escaped agency scope");
    const total = overview.reduce((sum, c) => sum + (snapshot.perClone[c.id]?.stars ?? 0), 0);
    assert.ok(Math.abs(total - snapshot.totals.stars) < 0.01, "Overview creator totals disagree with ledger");
    console.log("Live Moxy Overview roster, private portraits, audience counts and earnings reconciliation passed");
    for (const cloneId of moxy.cloneIds) {
      const sequences = await supabaseAdmin.from("video_sequences")
        .select("id,title,created_at,source_video_id,video_sequence_revisions(id,revision_no,state)")
        .eq("clone_id", cloneId).order("created_at", { ascending: false });
      assert.ok(!sequences.error, `Moxy Sequences list failed: ${sequences.error?.code ?? ""}`);
      const videos = await supabaseAdmin.from("videos").select("id,caption,storage_path")
        .eq("clone_id", cloneId).order("created_at", { ascending: false }).limit(200);
      assert.ok(!videos.error, `Moxy Sequences source list failed: ${videos.error?.code ?? ""}`);
      for (const sequence of sequences.data ?? []) {
        for (const item of sequence.video_sequence_revisions ?? []) {
          const revision = await supabaseAdmin.from("video_sequence_revisions")
            .select("id,revision_no,state,approved_by,approved_at,published_at,video_sequences!inner(id,clone_id,title,source_video_id)")
            .eq("id", item.id).maybeSingle();
          assert.ok(!revision.error && revision.data, "Moxy sequence revision unavailable");
          const parent = revision.data.video_sequences as unknown as { clone_id: string };
          assert.equal(parent.clone_id, cloneId, "Sequence revision escaped creator scope");
          const parts = await supabaseAdmin.from("video_sequence_parts")
            .select("position,is_preview,caption,price_stars,source_start_seconds,source_end_seconds,requires_position")
            .eq("revision_id", item.id).order("position");
          assert.ok(!parts.error, "Moxy sequence parts unavailable");
        }
      }
    }
    console.log(`Live Moxy Sequences list, source recordings and available revisions passed for ${moxy.cloneIds.length} assigned creators`);
  });

  // Read-only production check. Resolve the live roster and exercise the same
  // scoped routes used by the agency. No session, credential, or URL is logged.
  const identity = await agencyIdentityById(JESS_KATE_PORTAL.id);
  assert.ok(identity, "Agency identity unavailable");
  const clone = "02a49e27-606d-4f20-9472-fab39255753f";
  assert.ok(identity.cloneIds.includes(clone), "Creator assignment missing");
  await withDashboardAccess(identity, async () => {
    const started = Date.now();
    const response = await dashboard(new NextRequest(`https://dashboard.tgaiclone.xyz/api/dashboard?period=2W&clone=${clone}&fresh=force`));
    const data = await response.json();
    assert.equal(response.status, 200, `Earnings route failed: ${data.error ?? "unknown error"}`);
    assert.ok(Number.isFinite(data.totals?.stars), "Missing earnings total");
    assert.ok(data.analytics && !data.analyticsError, "Detailed analytics failed");
    assert.ok(data.clones.length === 1 && data.clones[0].id === clone, "Earnings scope mismatch");
    assert.ok(data.analytics.clones.every((item: {id:string}) => item.id === clone), "Analytics scope mismatch");
    assert.ok(!("costUsd" in data.totals), "Internal costs exposed");
    console.log(`Live 2W earnings and analytics passed in ${Date.now() - started}ms; creator scope and cost redaction passed`);
    for (const period of ["2W", "1D", "1M"] as const) {
      const result = period === "2W" ? response : await dashboard(new NextRequest(`https://dashboard.tgaiclone.xyz/api/dashboard?period=${period}&clone=${clone}&fresh=1`));
      const snapshot = period === "2W" ? data : await result.json();
      assert.equal(result.status, 200, `Live ${period} earnings failed: ${snapshot.error ?? "unknown"}`);
      const markup = renderToStaticMarkup(createElement(DashboardAccessProvider, { audience: "agency", agencyName: identity.name, children: createElement(RevenueDashboard, { cloneId: clone, initialData: snapshot }) }));
      assert.ok(markup.includes("Net revenue") && markup.includes("Recent ledger activity"), `Live ${period} render incomplete`);
      console.log(`Live ${period} agency component render passed; ${snapshot.recent.length} transactions`);
    }

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
  main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : error instanceof Error ? `${error.name}: ${error.message}\n${error.stack?.split("\n").slice(1, 6).join("\n")}` : "Dashboard recovery check failed"); process.exitCode = 1; }).finally(() => clearTimeout(timeout));
}

"use server";

// app/posting/actions.ts
//
// Server actions behind the Posting page. Thin wrappers over lib/posting.ts,
// the SAME functions the admin API's app/api/admin/v1/posting/* routes call,
// so the page can never do anything the API could not, and every live check
// (story right, bot admin in the channel, same-girl catalogue file) is the
// lib's, not this file's.
//
// AGENCY LOCKOUT, TWO LAYERS, same as app/mtproto-campaign/actions.ts:
// agencyDashboardPath() never lists "/posting", and every action calls
// guardDashboardAction FIRST; this file is absent from that guard's
// allowlist, so an agency session gets "Administrator access required".
//
// Errors are RETURNED as { ok: false, error } because Next hides the message
// of a thrown server-action error in production. The guard itself throws,
// and is the literal first statement of every action
// (scripts/check-lynq-management.tsx asserts that repo-wide).

import { guardDashboardAction } from "@/lib/agency-management";
import { logAdminWrite } from "@/lib/api-route";
import {
  deleteChannelPost,
  deleteStory,
  listCatalogue,
  listRecentPosts,
  listTargets,
  mediaFromCatalogue,
  postStory,
  postToChannel,
  type CatalogueItem,
  type MediaInput,
  type RecentPost,
  type Targets,
} from "@/lib/posting";
import { checkUrl, parseActivePeriod, parseBool, parseButtons, parseStarPrice, type MediaKind } from "@/lib/posting-validate";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function loadTargets(fresh: boolean): Promise<Result<Targets>> {
  await guardDashboardAction("app/posting/actions.ts#loadTargets", [fresh]);
  return attempt(() => listTargets({ fresh }));
}

export async function loadCatalogue(
  cloneId: string,
  kind: MediaKind,
  q: string,
  offset: number,
): Promise<Result<{ items: CatalogueItem[]; total: number }>> {
  await guardDashboardAction("app/posting/actions.ts#loadCatalogue", [cloneId, kind, q, offset]);
  return attempt(() =>
    listCatalogue({ cloneId, kind: kind === "video" ? "video" : "photo", q, offset: Math.max(0, offset), limit: 48 }),
  );
}

export async function loadRecent(cloneId: string | null): Promise<Result<RecentPost[]>> {
  await guardDashboardAction("app/posting/actions.ts#loadRecent", [cloneId]);
  return attempt(() => listRecentPosts({ cloneId, days: 30, limit: 100 }));
}

export type DestinationResult = {
  destination: "story" | "channel" | string;
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  detail?: Record<string, unknown>;
  warnings?: string[];
};

// One form, up to two destinations. Each destination is tried on its own, so
// a story that fails (right switched off a minute ago) never blocks the
// channel post, and the page shows both outcomes.
export async function publish(fd: FormData): Promise<Result<DestinationResult[]>> {
  await guardDashboardAction("app/posting/actions.ts#publish", [fd]);
  return attempt(async () => {
    const cloneId = String(fd.get("cloneId") ?? "");
    if (!cloneId) throw new Error("pick a girl first");
    const toStory = parseBool(fd.get("toStory"));
    const toChannel = parseBool(fd.get("toChannel"));
    const brands = fd.getAll("toBrand").map(String).filter(Boolean);
    if (!toStory && !toChannel && !brands.length) throw new Error("pick at least one place to post");
    const dryRun = parseBool(fd.get("dryRun"));

    // Media: one catalogue item, or uploaded file(s), or none (channel text only).
    const media: MediaInput[] = [];
    const itemKind = String(fd.get("itemKind") ?? "");
    const itemId = String(fd.get("itemId") ?? "");
    if (itemId) media.push(await mediaFromCatalogue(cloneId, itemKind === "video" ? "video" : "photo", itemId));
    for (const f of fd.getAll("file")) {
      if (f instanceof File && f.size > 0) media.push({ bytes: Buffer.from(await f.arrayBuffer()), mime: f.type, filename: f.name });
    }

    const caption = String(fd.get("caption") ?? "");
    const out: DestinationResult[] = [];

    if (toStory) {
      try {
        if (media.length !== 1) throw new Error("a story needs exactly one photo or video");
        const link = String(fd.get("linkUrl") ?? "").trim();
        const r = await postStory({
          cloneId,
          media: media[0],
          caption,
          activePeriod: parseActivePeriod(fd.get("activePeriod")),
          linkUrl: link ? checkUrl(link, "story link") : null,
          postToChatPage: parseBool(fd.get("postToChatPage")),
          protectContent: false,
          fit: true,
          dryRun,
        });
        if (!r.dryRun) logAdminWrite("posting:story", cloneId, { ...r.posted, via: "dashboard" });
        out.push({ destination: "story", ok: true, dryRun: r.dryRun, detail: (r.dryRun ? r.wouldPost : r.posted) as Record<string, unknown> });
      } catch (e) {
        out.push({ destination: "story", ok: false, error: msg(e) });
      }
    }

    // Her channel first, then each brand channel, all with the same channel options.
    for (const brand of [...(toChannel ? [null] : []), ...brands]) {
      const destination = brand ?? "channel";
      try {
        const own = String(fd.get("channelText") ?? "");
        const r = await postToChannel({
          cloneId,
          channel: null,
          brand,
          text: own.trim() ? own : caption,
          media,
          buttons: parseButtons(fd.get("buttons")),
          pin: parseBool(fd.get("pin")),
          starPrice: parseStarPrice(fd.get("starPrice")),
          silent: parseBool(fd.get("silent")),
          protectContent: false,
          dryRun,
        });
        if (!r.dryRun) logAdminWrite("posting:channel_post", cloneId, { ...r.posted, warnings: r.warnings, via: "dashboard" });
        out.push({
          destination,
          ok: true,
          dryRun: r.dryRun,
          detail: (r.dryRun ? r.wouldPost : r.posted) as Record<string, unknown>,
          warnings: r.warnings,
        });
      } catch (e) {
        out.push({ destination, ok: false, error: msg(e) });
      }
    }
    return out;
  });
}

export async function removePost(p: {
  kind: "story" | "channel_post";
  cloneId: string | null;
  brand?: string | null;
  storyId?: number | null;
  channel?: string | null;
  messageIds?: number[] | null;
}): Promise<Result<unknown>> {
  await guardDashboardAction("app/posting/actions.ts#removePost", [p]);
  return attempt(async () => {
    if (p.kind === "story") {
      if (!p.storyId || !p.cloneId) throw new Error("no story id");
      const r = await deleteStory(p.cloneId, p.storyId);
      logAdminWrite("posting:delete_story", p.cloneId, { ...r, via: "dashboard" });
      return r;
    }
    if (!p.messageIds?.length) throw new Error("no message ids");
    const r = await deleteChannelPost(p.cloneId, p.channel ?? null, p.messageIds, p.brand ?? null);
    logAdminWrite("posting:delete_channel_post", p.cloneId, { ...r, via: "dashboard" });
    return r;
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { getCreatorWorkspace } from "@/lib/creator-dashboard";
import { getCreatorTelegramScope } from "@/lib/creator-telegram-access";
import { loadCreatorTelegramFeed, InvalidFeedRequest } from "@/lib/creator-telegram-feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  try {
    const creator = await getCreatorWorkspace();
    if (!creator) return json({ error: "Please sign in again." }, 401);
    const scope = await getCreatorTelegramScope(creator);
    if (!scope) return json({ error: "Chat access unavailable." }, 403);

    const params = request.nextUrl.searchParams;
    if ([...params.keys()].some(key => !["fan", "cursor"].includes(key) || params.getAll(key).length !== 1)) {
      return json({ error: "Invalid feed request." }, 400);
    }
    return json(await loadCreatorTelegramFeed(scope, params.get("fan"), params.get("cursor")));
  } catch (error) {
    if (error instanceof InvalidFeedRequest) return json({ error: "Invalid feed request." }, 400);
    return json({ error: "Telegram chats could not be loaded. Please try again." }, 503);
  }
}

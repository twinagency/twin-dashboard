// Bot V2 admin page. The V2 bot (separate app on the bot box) serves its own page and API on the
// box's private address only; this route proxies it so it sits behind the dashboard login
// (middleware covers /bot-v2 like every other admin route) and is never exposed to the internet.
export const dynamic = "force-dynamic";

const UPSTREAM = process.env.BOT_V2_URL ?? "http://172.31.6.134:4300";

async function proxy(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  const url = new URL(req.url);
  const target = `${UPSTREAM}/${path.length ? path.map(encodeURIComponent).join("/") : "twin"}${url.search}`;
  try {
    const res = await fetch(target, {
      method: req.method,
      headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
      body: req.method === "POST" ? await req.text() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    return new Response(res.body, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "text/plain", "cache-control": "no-store" } });
  } catch {
    return new Response("Bot V2 is not reachable right now.", { status: 502 });
  }
}

export { proxy as GET, proxy as POST };

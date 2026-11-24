import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { getCreatorTelegramScope } from "@/lib/creator-telegram-access";
import { loadCreatorTelegramFeed, InvalidFeedRequest } from "@/lib/creator-telegram-feed";
import { parseFlirtCreatorLocale, FLIRT_CREATOR_LOCALE_COOKIE } from "@/lib/flirt-creator-locale";

const pagePath = "/creator/telegram";
const feedPath = "/creator-auth/telegram/feed";
const client = readFileSync(join(__dirname, "feed.js"), "utf8").replace(/<\/script/gi, "<\\/script");
const css = readFileSync(join(__dirname, "feed.css"), "utf8");
function cookie(header: string, name: string) {
  const items = header.split(";").map(item => item.trim()).filter(item => item.startsWith(name + "="));
  return items.length === 1 ? items[0].slice(name.length + 1) : undefined;
}
function html(lang: "en" | "pt-BR", nonce: string) {
  const title = lang === "pt-BR" ? "Conversas ao vivo no Telegram" : "Live Telegram chats";
  const back = lang === "pt-BR" ? "Voltar ao painel" : "Back to dashboard";
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · FLIRT</title><style nonce="${nonce}">${css}</style></head><body><main><a class="back-link" href="/creator">← ${back}</a><div id="telegram-feed"></div></main><script nonce="${nonce}">${client}</script></body></html>`;
}

const app = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  const json = (status: number, value: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(value));
  };
  try {
    const rawPath = (req.url || "").split("?")[0];
    if (rawPath !== pagePath && rawPath !== feedPath) return json(404, { error: "Not found." });
    if (!["GET", "HEAD"].includes(req.method || "") || req.headers["next-action"] !== undefined) {
      res.setHeader("Allow", "GET, HEAD");
      return json(405, { error: "Method unavailable." });
    }
    const cookies = req.headers.cookie || "";
    const identity = await creatorDashboardIdentity(cookie(cookies, CREATOR_SESSION_COOKIE));
    if (!identity && rawPath === pagePath) {
      res.writeHead(303, { Location: "/creator/login?next=%2Fcreator%2Ftelegram" });
      return res.end();
    }
    if (!identity) return json(401, { error: "Please sign in again." });
    const slug = await getCreatorTelegramScope(identity);
    if (!slug) return json(403, { error: "Chat access unavailable." });
    const params = new URL(req.url!, "http://localhost").searchParams;
    const allowed = rawPath === feedPath ? ["fan", "cursor"] : [];
    if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) {
      return json(400, { error: "Invalid feed request." });
    }
    if (req.method === "HEAD") { res.writeHead(204); return res.end(); }
    if (rawPath === feedPath) return json(200, await loadCreatorTelegramFeed(slug, params.get("fan"), params.get("cursor")));
    const nonce = randomBytes(18).toString("base64");
    res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html(parseFlirtCreatorLocale(cookie(cookies, FLIRT_CREATOR_LOCALE_COOKIE)) || "en", nonce));
  } catch (err) {
    if (err instanceof InvalidFeedRequest) return json(400, { error: "Invalid feed request." });
    return json(503, { error: "Telegram chats could not be loaded. Please try again." });
  }
});
app.listen(Number(process.env.TELEGRAM_FEED_PORT || 3087), process.env.TELEGRAM_FEED_HOST || "127.0.0.1");

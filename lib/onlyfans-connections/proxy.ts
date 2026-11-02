/**
 * Operator entry for an account's fixed proxy. Pure helpers, no network, no storage.
 * The normalised URL is what the existing "save" command carries as proxyUrl (see contract.ts);
 * the backend seals it encrypted and never returns it, so the only thing the page can ever show
 * is what the operator is typing right now, masked.
 */
export type ProxyEntry = { ok: true; url: string | null; masked: string } | { ok: false; message: string };

/** The real backend rule, in words. Shown beside the field so a proxy change is never a surprise. */
export const PROXY_RULE =
  "Saving replaces the stored session and the proxy together, so a capture is required. Take that capture through this same proxy: " +
  "the backend binds the login to the network it was created on, and a creator session refresh is refused if the network differs. " +
  "Outgoing messages switch off until the new connection is verified and enabled again.";

const SCHEME = /^(https?|socks5h?):\/\//i;
const HOST = /^(?:\[[0-9a-fA-F:]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)$/;
const decodeOnce = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };
const encode = (value: string) => encodeURIComponent(decodeOnce(value));

const FORMATS = "Use scheme://user:pass@host:port, user:pass@host:port, host:port:user:pass or host:port. Schemes: http, https, socks5, socks5h.";

/** Accepts the formats proxy vendors hand out and returns one canonical URL, or a plain reason it cannot be used. */
export function normalizeProxyInput(raw: string): ProxyEntry {
  const text = raw.trim();
  if (!text) return { ok: true, url: null, masked: "No proxy. This account would send from the server's own address." };
  if (/\s/.test(text) || !/^[\x21-\x7e]{1,2048}$/.test(text)) return { ok: false, message: "The proxy contains spaces or characters that are not allowed. " + FORMATS };
  let scheme = "http", rest = text;
  const withScheme = SCHEME.exec(text);
  if (withScheme) { scheme = withScheme[1].toLowerCase(); rest = text.slice(withScheme[0].length); }
  else if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(text)) return { ok: false, message: "Only http, https, socks5 and socks5h proxies are supported." };
  let user = "", pass = "", host = "", port = "";
  if (!withScheme && !rest.includes("@") && rest.split(":").length >= 4 && /^\d{1,5}$/.test(rest.split(":")[1])) {
    const [h, p, u, ...pw] = rest.split(":"); host = h; port = p; user = u; pass = pw.join(":");
    if (!user || !pass) return { ok: false, message: "The proxy login is incomplete. " + FORMATS };
  } else {
    let hostPort = rest.replace(/\/$/, "");
    const at = hostPort.lastIndexOf("@");
    if (at >= 0) {
      const login = hostPort.slice(0, at); hostPort = hostPort.slice(at + 1);
      const colon = login.indexOf(":");
      if (colon <= 0 || colon === login.length - 1) return { ok: false, message: "The proxy login must be user:password. " + FORMATS };
      user = login.slice(0, colon); pass = login.slice(colon + 1);
    }
    const match = /^(.+):(\d+)$/.exec(hostPort);
    if (!match) return { ok: false, message: "The proxy needs a port, for example host:8080. " + FORMATS };
    host = match[1]; port = match[2];
  }
  if (!HOST.test(host) || host.includes("/")) return { ok: false, message: "The proxy host is not valid. " + FORMATS };
  const number = Number(port);
  if (!/^\d{1,5}$/.test(port) || number < 1 || number > 65535) return { ok: false, message: "The proxy port must be a number from 1 to 65535." };
  const login = user ? encode(user) + ":" + encode(pass) + "@" : "";
  const url = `${scheme}://${login}${host}:${number}`;
  return { ok: true, url, masked: maskProxy(url) };
}

/** Scheme, host and port stay visible so the operator can confirm the endpoint; the login never does. */
export function maskProxy(url: string): string {
  const match = /^([a-z0-9]+):\/\/(?:(.*)@)?([^@]+)$/i.exec(url);
  if (!match) return "Invalid proxy";
  return `${match[1].toLowerCase()}://${match[2] === undefined ? "" : "****:****@"}${match[3]}`;
}

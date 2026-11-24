(() => {
  "use strict";
  const launcher = Symbol.for("flirt.creatorTelegramLauncher");
  if (window[launcher]) return;
  window[launcher] = true;

  const studio = '[data-creator-studio="flirt"][data-creator-workspace-shell="true"]';
  const marker = "data-flirt-telegram-launcher";
  const path = "/creator/telegram";
  let root = null;
  let authorized = false;
  let active = true;
  let pending = null;
  const style = document.createElement("style");
  if (document.currentScript?.nonce) style.nonce = document.currentScript.nonce;
  // The studio sets its six mobile columns inline. Override that grid only
  // while our seventh item is present, leaving its original styles intact.
  style.textContent = studio + " > nav:has(> [" + marker + "]) {grid-template-columns:repeat(7,minmax(0,1fr))!important}";
  document.head.append(style);

  function home() {
    if (location.pathname.replace(/\/$/, "") !== "/creator") return null;
    const shell = document.querySelector(studio);
    return shell?.querySelector('nav a[href="/creator"][aria-current="page"]') ? shell : null;
  }

  function render() {
    if (!authorized || !root) {
      document.querySelectorAll("[" + marker + "]").forEach(link => link.remove());
      return;
    }
    for (const nav of root.querySelectorAll(":scope > aside nav, :scope > nav")) {
      const homeLink = nav.querySelector(':scope > a[href="/creator"]');
      if (!homeLink || nav.querySelector('a[href="' + path + '"]')) continue;
      const link = document.createElement("a");
      link.setAttribute(marker, "");
      link.href = path;
      link.className = homeLink.className;
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      for (const [key, value] of Object.entries({ width: "19", height: "19", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linejoin": "round", "aria-hidden": "true" })) {
        icon.setAttribute(key, value);
      }
      const outline = document.createElementNS(icon.namespaceURI, "path");
      outline.setAttribute("d", "M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.8-.9L3 21l1.9-5.7a9 9 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z");
      icon.append(outline);
      const label = document.createElement("span");
      label.textContent = "Telegram";
      link.append(icon, label);
      nav.append(link);
    }
  }

  async function sync(recheck = false) {
    if (!active) return;
    const next = home();
    if (root !== next) {
      pending?.abort();
      pending = null;
      root = next;
      authorized = false;
      recheck = true;
    }
    render();
    if (!root || !recheck || pending || document.visibilityState !== "visible") return;
    const target = root;
    const request = new AbortController();
    pending = request;
    const timeout = setTimeout(() => request.abort(), 8000);
    try {
      const response = await fetch("/creator-auth/telegram/feed", {
        method: "HEAD", cache: "no-store", credentials: "same-origin", redirect: "error", signal: request.signal,
      });
      if (pending === request && target === home()) {
        authorized = response.status === 204;
      }
    } catch {
      if (pending === request) authorized = false;
    } finally {
      clearTimeout(timeout);
      if (pending === request) { pending = null; render(); }
    }
  }

  const observer = new MutationObserver(() => { void sync(); });
  const observe = () => observer.observe(document.documentElement, { childList: true, subtree: true });
  observe();
  window.addEventListener("pagehide", () => {
    active = false;
    observer.disconnect();
    pending?.abort();
    pending = null;
    root = null;
    authorized = false;
    render();
  });
  const refresh = () => { void sync(true); };
  window.addEventListener("pageshow", () => { active = true; observe(); refresh(); });
  window.addEventListener("popstate", refresh);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  window.setInterval(refresh, 30_000);
  refresh();
})();

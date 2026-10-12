// Standalone credential handoff: no analytics, third-party scripts or app shell.
export function ownerShortcutPage(nonce: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Opening your dashboard</title>
<style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#101012;color:#fafafa;font-family:system-ui,sans-serif;padding:24px}main{max-width:360px;text-align:center}h1{font-size:24px;font-weight:600}p,a{color:#babac1;font-size:16px;line-height:1.5}a{display:inline-block;padding:12px}</style></head>
<body><main><h1 id="status">Opening your dashboard…</h1>
<p id="detail">Signing you in securely.</p><a href="/login?owner=1">Sign in another way</a>
<noscript><p>Enable JavaScript to use this private link.</p></noscript></main>
<script nonce="${nonce}">(() => {
  const token = location.hash.slice(1);
  history.replaceState(null, "", location.pathname);
  if (!token) { location.replace("/revenue"); return; }
  const failed = () => {
    document.getElementById("status").textContent = "This link is unavailable";
    document.getElementById("detail").textContent = "It may have expired. Use your normal sign-in or request a fresh link.";
  };
  if (!/^owner_[a-f0-9]{64}$/.test(token)) { failed(); return; }
  fetch("/admin-access", { method: "POST", headers: { "Content-Type": "text/plain" },
    credentials: "same-origin", cache: "no-store", body: token })
    .then(async response => {
      if (!response.ok) { failed(); return; }
      const data = await response.json();
      const destination = new URL(data.destination, location.origin);
      if (destination.origin !== location.origin || destination.pathname !== "/revenue") { failed(); return; }
      location.replace(destination.href);
    }).catch(failed);
})();</script></body></html>`;
}


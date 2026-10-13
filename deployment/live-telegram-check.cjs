// Read-only production probe. Do not print messages, session tokens or keys.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
async function main() {
  if (process.env.VERIFY_UNIFIED === '1' && process.env.EXPECTED_DASHBOARD_SHA) assert.equal(process.env.GIT_SHA, process.env.EXPECTED_DASHBOARD_SHA, 'Running dashboard commit');
  const api = process.env.SUPABASE_URL + '/rest/v1/';
  const headers = { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` };
  const read = async path => { const r = await fetch(api + path, { headers, signal: AbortSignal.timeout(15000) }); assert(r.ok, `Database read ${r.status}`); return r.json(); };
  const creators = await read('clones?select=id,name,slug,engine&engine=eq.v2');
  const upstream = process.env.BOT_V2_URL || 'http://172.31.6.134:4300';
  const report = [];
  for (const creator of creators) {
    const r = await fetch(`${upstream}/api/fans?girl=${encodeURIComponent(creator.slug)}`, { signal: AbortSignal.timeout(15000) });
    assert(r.ok, `${creator.name} fan list ${r.status}`);
    const fans = await r.json(); assert(Array.isArray(fans));
    const fan = fans.find(f => /^\d+$/.test(String(f.chatId)));
    let page = null;
    if (fan) {
      const h = await fetch(`${upstream}/api/chat-history?${new URLSearchParams({ girl: creator.slug, chatId: String(fan.chatId) })}`, { signal: AbortSignal.timeout(15000) });
      assert(h.ok, `${creator.name} history ${h.status}`);
      page = await h.json(); assert(Array.isArray(page.history));
      assert.equal(page.days, 90); assert(page.history.length <= 100);
    }
    report.push({ creator: creator.name, fans: fans.length, sampleMessages: page?.history.length ?? 0, days: page?.days ?? null, more: page?.hasMore ?? false });
    if (process.env.VERIFY_UNIFIED === '1' && fan) {
      const users = await read(`users?select=id&clone_id=eq.${creator.id}&telegram_id=eq.${fan.chatId}&limit=1`);
      const id = users[0]?.id || `v2_${creator.id}_${fan.chatId}`;
      const payload = String(Date.now() + 60000);
      const sig = crypto.createHmac('sha256', process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_PASSWORD).update(payload).digest('base64url');
      const cookie = `allie_admin_session=${payload}.${sig}; clone_scope=${creator.id}`;
      const view = await fetch(`http://127.0.0.1:3001/users?fan=${encodeURIComponent(id)}`, { headers: { cookie }, signal: AbortSignal.timeout(60000) });
      assert.equal(view.status, 200, `${creator.name} unified page`);
      const html = await view.text();
      assert(!html.includes('could not refresh'), `${creator.name} history refresh`);
      assert(!/href="\/bot-v2"/.test(html), 'Separate V2 navigation removed');
      if (page?.history.length) assert(html.includes('data-message-id="v2:'), `${creator.name} V2 message rendered`);
      const old = await fetch('http://127.0.0.1:3001/bot-v2', { headers: { cookie }, redirect: 'manual' });
      assert.equal(old.status, 307); assert(old.headers.get('location')?.endsWith('/users'));
      report[report.length - 1].unifiedPage = 'passed';
    }
  }
  console.log(JSON.stringify({ runningCommit: process.env.GIT_SHA, mode: process.env.VERIFY_UNIFIED === '1' ? 'unified' : 'source', creators: report }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });

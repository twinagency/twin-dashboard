// Read only. Report coverage and source identities, never message text or credentials.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { config } from './src/config.ts';
import { messagesForTurn } from './dashboard/history.ts';
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const response = await fetch(config.supabaseUrl + '/rest/v1/clones?select=id,slug,engine&engine=eq.v2', { headers: { apikey: config.supabaseKey, Authorization: 'Bearer ' + config.supabaseKey }, signal: AbortSignal.timeout(15000) });
if (!response.ok) throw Error('Creator read failed: ' + response.status);
const creators = await response.json();
const report = [];
for (const creator of creators) {
  const file = path.join(config.logDir, creator.slug, 'requests.jsonl');
  const fans = new Map(); let bad = 0;
  if (fs.existsSync(file)) {
    for await (const line of readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })) {
      if (!line) continue;
      let row; try { row = JSON.parse(line); } catch { bad++; continue; }
      const messages = messagesForTurn(row, crypto.createHash('sha256').update(line).digest('hex'));
      if (!messages.length) continue;
      const key = String(row.chatId), value = fans.get(key) || { count: 0, oldest: row.ts, newest: row.ts };
      value.count += messages.length;
      if (row.ts < value.oldest) value.oldest = row.ts;
      if (row.ts > value.newest) value.newest = row.ts;
      fans.set(key, value);
    }
  }
  const busy = [...fans].sort((a, b) => b[1].count - a[1].count)[0];
  const samples = [...new Set(['6814483810', ...(busy ? [busy[0]] : [])])];
  const coverage = [];
  for (const id of samples) {
    let cursor = null, pages = 0, oldest = null, newest = null; const seen = new Set();
    do {
      const url = 'http://127.0.0.1:4300/api/chat-history?' + new URLSearchParams({ girl: creator.slug, chatId: id, ...(cursor ? { before: cursor } : {}) });
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (r.status === 404) break;
      if (!r.ok) throw Error('History read failed: ' + r.status);
      const p = await r.json(); pages++;
      for (const m of p.history) { if (seen.has(m.id)) throw Error('Repeated history cursor'); seen.add(m.id); if (!oldest || m.at < oldest) oldest = m.at; if (!newest || m.at > newest) newest = m.at; }
      cursor = p.nextCursor;
      if (pages > 200) throw Error('Sample history exceeded audit page bound');
    } while (cursor);
    coverage.push({ sample: id === '6814483810' ? 'owner-test-account' : 'longest-conversation', stored: fans.get(id) || null, rendered: seen.size, pages, oldest, newest });
  }
  report.push({ creator: creator.slug, fans: fans.size, logBytes: fs.existsSync(file) ? fs.statSync(file).size : 0, malformed: bad, coverage });
}
console.log(JSON.stringify({ revision: process.env.GIT_SHA, source: Object.fromEntries(['dashboard/history.ts', 'dashboard/history-client.js', 'dashboard/server.ts'].map(file => [file, sha(file)])), creators: report }));

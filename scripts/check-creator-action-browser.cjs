// Uses the real client component in isolated Chromium/WebKit fixtures. No live accounts.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { build } = require('esbuild');
const { chromium, webkit } = require('playwright');

(async () => {
  const built = await build({
    stdin: { contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import Action from './components/CreatorOnboardingActionForm';
      const p = new URLSearchParams(location.search);
      const action = p.get('action') || 'consent';
      createRoot(document.getElementById('root')).render(<Action pendingLabel="Saving fixture…"
        successStatuses={[action === 'consent' ? 'consent_saved' : action === 'skip_voice' ? 'voice_skipped' : 'submitted']}
        loginPath="/creator/moxy/login">
        <input type="hidden" name="action" value={action}/>
        <input type="hidden" name="fixture_mode" value={p.get('mode') || ''}/>
        {action === 'consent' && <><label>Legal name<input name="legal_name" required defaultValue="Synthetic Browser Test"/></label>
          <label><input type="checkbox" name="agreed" required defaultChecked/>Fixture consent</label></>}
        <button type="submit">Save fixture</button>
      </Action>);
    `, resolveDir: process.cwd(), sourcefile: 'creator-action-fixture.tsx', loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  let posts = [], failOnce = false;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'POST') {
        if (url.pathname !== '/creator-auth/onboarding') {
          res.writeHead(404); res.end('Wrong save destination'); return;
        }
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const form = await new Request(url, { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) }).formData();
        const action = form.get('action');
        posts.push({ action, legalName: form.get('legal_name'), agreed: form.get('agreed') });
        let location = action === 'submit' ? '/creator?submitted=1' :
          '/creator/onboarding?step=' + (action === 'consent' ? 'consent' : 'voice') + '&status=' + (action === 'consent' ? 'consent_saved' : 'voice_skipped');
        if (form.get('fixture_mode') === 'expired') location = '/creator/moxy/login';
        if (failOnce) { failOnce = false; location = '/creator/onboarding?step=consent&status=error'; }
        res.writeHead(303, { location }); res.end(); return;
      }
      if (url.pathname === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(built.outputFiles[0].text); return; }
      res.setHeader('Content-Type', 'text/html');
      if (url.pathname === '/creator') { res.end('<h1>Submitted fixture</h1>'); return; }
      if (url.searchParams.has('status')) { res.end('<h1>Saved fixture</h1>'); return; }
      if (url.pathname.endsWith('/login')) { res.end('<h1>Fixture sign in</h1>'); return; }
      res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script src="/fixture.js"></script>');
    } catch (error) { res.writeHead(500); res.end('Fixture failed'); console.error(error); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    for (const [name, engine] of [['Chromium', chromium], ['WebKit', webkit]]) {
      const browser = await engine.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        for (const action of ['consent', 'skip_voice', 'submit']) {
          posts = [];
          await page.goto(origin + '/creator/onboarding?step=consent&action=' + action);
          await page.getByRole('button', { name: 'Save fixture' }).waitFor();
          assert.equal(await page.locator('form').evaluate(form => form.action === form.querySelector('[name="action"]')), true,
            'Real browser must expose the named-field shadowing that JSDOM missed');
          await page.getByRole('button', { name: 'Save fixture' }).click();
          await page.waitForURL(action === 'submit' ? '**/creator?submitted=1' : '**status=' + (action === 'consent' ? 'consent_saved' : 'voice_skipped'));
          assert.equal(posts.length, 1); assert.equal(posts[0].action, action);
          if (action === 'consent') { assert.equal(posts[0].legalName, 'Synthetic Browser Test'); assert.equal(posts[0].agreed, 'on'); }
          await page.reload();
          await page.getByRole('heading', { name: action === 'submit' ? 'Submitted fixture' : 'Saved fixture' }).waitFor();
        }
        posts = []; failOnce = true;
        await page.goto(origin + '/creator/onboarding?step=consent');
        await page.getByRole('button', { name: 'Save fixture' }).click();
        await page.getByRole('alert').waitFor();
        assert.equal(await page.getByLabel('Legal name').inputValue(), 'Synthetic Browser Test');
        await page.getByRole('button', { name: 'Save fixture' }).click();
        await page.waitForURL('**status=consent_saved'); assert.equal(posts.length, 2);
        await page.goto(origin + '/creator/onboarding?step=consent&mode=expired');
        await page.getByRole('button', { name: 'Save fixture' }).click();
        await page.getByRole('link', { name: 'Sign in and return' }).waitFor();
        assert.match(await page.getByRole('alert').innerText(), /session expired/);
        console.log(name + ': real consent, voice skip and submit buttons reach correct endpoint; errors preserve entries; retry and expired-session return pass.');
      } finally { await browser.close(); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

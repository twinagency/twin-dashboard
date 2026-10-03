/* Runs inside FLIRT only. No credentials, cookies or customer records are logged. */
const { randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const PROJECT = 'lkmfwpqegjluirfusnaw';
const ORIGIN = 'https://dashboard.flirtaiagency.com';
const API = `https://${PROJECT}.supabase.co`;
const fixtures = [];
const checks = [];
const sections = ['personal-contact','background-story','audience-identity','style-tone-ai','goals-replies','collaboration-boundaries','ai-context','identity-basics','family-home','appearance','sizes-health','work-public-life','personality-depth','favourites-media','favourites-lifestyle','travel-lifestyle','relationships'];
function assert(ok, label) { if (!ok) throw new Error(label); }
async function request(url, options = {}) { return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(25000), ...options }); }
async function api(path, options = {}) {
  const response = await request(API + path, { ...options, headers: { apikey: process.env.SUPABASE_SERVICE_KEY, ...options.headers } });
  assert(response.ok, `FLIRT fixture API returned ${response.status}`);
  if (response.status === 204) return null;
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
async function page(path, fixture, options = {}) {
  return request(ORIGIN + path, { ...options, headers: { Origin: ORIGIN, ...(fixture ? { Cookie: fixture.cookie } : {}), ...options.headers } });
}
async function rows(table, fixture, select = '*') {
  return api(`/rest/v1/${table}?select=${encodeURIComponent(select)}&creator_account_id=eq.${fixture.id}`);
}
async function accountRows(email) { return api('/rest/v1/creator_accounts?select=id,auth_user_id,account_status&email=eq.' + encodeURIComponent(email)); }
async function signup(suffix) {
  const fixture = { email: `flirt-optional-${Date.now()}-${randomBytes(7).toString('hex')}-${suffix}@example.com`, password: randomBytes(24).toString('hex') };
  fixtures.push(fixture);
  assert((await accountRows(fixture.email)).length === 0, 'Synthetic account collision');
  const response = await page('/creator-auth/signup', null, { method: 'POST', body: new URLSearchParams({ display_name: 'FLIRT optional intake check', email: fixture.email, password: fixture.password }) });
  const saved = await accountRows(fixture.email);
  if (saved.length === 1) Object.assign(fixture, saved[0]);
  assert(response.status === 303 && fixture.id && fixture.auth_user_id, 'Synthetic signup failed');
  const cookie = response.headers.getSetCookie().find(value => value.startsWith('twin_creator_session='));
  assert(cookie && /HttpOnly/i.test(cookie) && /Secure/i.test(cookie), 'Secure creator session missing');
  fixture.cookie = cookie.split(';')[0];
  return fixture;
}
async function upload(fixture, kind, name, bytes, mime, jsonResponse = false) {
  const form = new FormData();
  form.set('kind', kind);
  form.append('files', bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime }), name);
  return page('/creator-auth/upload', fixture, { method: 'POST', body: form, signal: AbortSignal.timeout(120000), ...(jsonResponse ? { headers: { Accept: 'application/json' } } : {}) });
}
async function post(fixture, action, fields = {}) {
  return page('/creator-auth/onboarding', fixture, { method: 'POST', body: new URLSearchParams({ action, ...fields }) });
}
function location(response) { return new URL(response.headers.get('location'), ORIGIN); }
function noRequired(html, label) {
  assert(!/<(?:input|textarea|select)\b[^>]*\srequired(?:=|\s|>)/i.test(html), `${label} still has a required field`);
  assert(html.includes('data-onboarding-optional="true"'), `${label} is not optional`);
}
function buttonDisabled(openingTag) {
  // Quoted class values contain disabled: utilities even on enabled buttons.
  const attributesOnly = openingTag.replace(/"[^"]*"|'[^']*'/g, '""');
  return /\sdisabled(?=[\s=>])/i.test(attributesOnly)
    || /\saria-disabled\s*=\s*["']true["']/i.test(openingTag);
}
async function main() {
  assert(process.env.FLIRT_BACKEND_ENABLED === 'true' && process.env.FLIRT_SUPABASE_PROJECT_REF === PROJECT && process.env.SUPABASE_URL === API && process.env.DASHBOARD_PUBLIC_ORIGIN === ORIGIN, 'Refusing a non-FLIRT runtime');
  assert(!buttonDisabled('<button class="disabled:pointer-events-none disabled:opacity-50">'), 'Disabled class parsing regression');
  assert(buttonDisabled('<button class="button" disabled="">'), 'Disabled attribute parsing regression');
  assert(buttonDisabled('<button disabled>'), 'Boolean disabled parsing regression');
  assert(buttonDisabled('<button aria-disabled="true">'), 'Accessible disabled parsing regression');
  const unauthenticated = await post(null, 'submit');
  assert([303,307,308].includes(unauthenticated.status) && location(unauthenticated).pathname.includes('/login'), 'Anonymous submission must require sign-in');
  checks.push('Unauthenticated submission denied over public HTTPS');
  const a = await signup('walkthrough');
  const b = await signup('skip-all');
  const draftDashboard = await page('/creator', a);
  assert(draftDashboard.status === 200 && (await draftDashboard.text()).includes('data-return-to-onboarding'), 'Draft creators must be able to move from dashboard back to onboarding');
  for (const section of sections) {
    const response = await page(`/creator/onboarding?step=questionnaire&section=${section}`, a);
    assert(response.status === 200, 'Questionnaire page did not load');
    noRequired(await response.text(), section);
  }
  checks.push('All 17 questionnaire pages load without required fields');
  const existing = await rows('creator_applications', a, 'answers,updated_at');
  const questionnaire = await post(a, 'questionnaire', { revision: existing[0]?.updated_at || '' });
  assert(location(questionnaire).searchParams.get('step') === 'content', 'Empty questionnaire could not continue');
  const content = await page('/creator/onboarding?step=content', a);
  const contentHtml = await content.text();
  assert(content.status === 200, 'Content page failed');
  noRequired(contentHtml, 'content');
  assert(contentHtml.includes('data-onboarding-back="questionnaire"') && contentHtml.includes('data-onboarding-next="consent"'), 'Content Back/Next navigation missing');
  const chooseControls = [...contentHtml.matchAll(/<label\b[^>]*data-choose-content[^>]*>[\s\S]*?<\/label>/g)];
  assert(chooseControls.length === 4 && chooseControls.every(match => !buttonDisabled(match[0]) && match[0].includes('bg-[#dc2626]')), 'Four red native Choose content controls must be enabled');
  assert((contentHtml.match(/data-upload-content/g) || []).length === 4, 'Upload content buttons missing');
  assert(contentHtml.includes('data-onboarding-continue="consent"'), 'Content must continue directly to consent without uploads');
  assert(!contentHtml.includes('data-onboarding-continue="voice"'), 'Content must not link to hidden voice');
  const voice = await page('/creator/onboarding?step=voice', a);
  assert([303,307,308].includes(voice.status) && location(voice).pathname === '/creator/onboarding' && location(voice).searchParams.get('step') === 'consent', 'Old voice links must redirect to consent');
  const consentPage = await page('/creator/onboarding?step=consent', a);
  const consentHtml = await consentPage.text();
  noRequired(consentHtml, 'consent');
  assert(!consentHtml.includes('data-readiness-item="voice"'), 'Final checklist must hide voice');
  assert(/Step\s+3\s+·\s+Optional/.test(consentHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')), 'Consent must be step 3');
  const finishButton = consentHtml.match(/(<button\b[^>]*>)Finish onboarding<\/button>/);
  assert(finishButton, 'Final action missing');
  assert(!buttonDisabled(finishButton[1]), 'Final action remains blocked');
  const skippedConsent = await post(a, 'consent');
  assert(location(skippedConsent).searchParams.get('status') === 'consent_skipped', 'Blank consent was not skippable');
  assert((await rows('creator_consents', a, 'id')).length === 0, 'Skipped consent must not create a signature');
  const submit = await post(a, 'submit');
  assert(submit.status === 303 && location(submit).pathname === '/creator', 'Empty onboarding did not finish');
  const home = await page('/creator', a);
  assert(home.status === 200, 'Submitted empty intake cannot enter the workspace');
  const submittedRows = await rows('creator_applications', a, 'status,answers');
  assert(submittedRows.length === 1 && submittedRows[0].status === 'submitted', 'Submission was not persisted');
  assert(Object.keys(submittedRows[0].answers || {}).length === 0, 'Blank walkthrough invented answers');
  for (const table of ['creator_consents','creator_files','creator_clone_links']) assert((await rows(table, a, 'creator_account_id')).length === 0, `Walkthrough invented ${table}`);
  assert((await accountRows(a.email))[0].account_status === a.account_status, 'Intake silently changed creator approval');
  assert((await rows('creator_onboarding_progress', a, 'voice_completed')).every(row => !row.voice_completed), 'Hidden voice must not invent completion');
  checks.push('Three-step onboarding: content goes directly to consent, old voice links redirect, and submission succeeds without a voice action');
  checks.push('No fabricated answers, consent, files, clone links or creator approval');

  const hub = await page('/creator/onboarding', b);
  const hubHtml = await hub.text();
  const hubSteps = [...hubHtml.matchAll(/data-onboarding-step-card="([^"]+)"/g)].map(match => match[1]);
  assert(JSON.stringify(hubSteps) === JSON.stringify(['questionnaire','content','consent']), 'Onboarding hub must show exactly the three visible steps in order');
  assert(!hubHtml.includes('?step=voice'), 'Onboarding hub must not link to voice');
  assert(/Step\s+3\s+·\s+Optional/.test(hubHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')), 'Hub consent card must be step 3');
  assert(hubHtml.includes('data-onboarding-skip-all'), 'Skip-all action missing');
  assert((await rows('creator_applications', b, 'status')).every(row => row.status === 'draft'), 'Another creator submission leaked to this account');
  const skipAll = await post(b, 'submit', { creator_account_id: a.id });
  assert(skipAll.status === 303 && location(skipAll).pathname === '/creator', 'Skip-all failed');
  assert((await page('/creator', b)).status === 200, 'Skip-all cannot enter the workspace');
  assert((await rows('creator_consents', b, 'id')).length === 0, 'Skip-all invented consent');
  assert((await rows('creator_files', b, 'id')).length === 0, 'Skip-all invented uploads');
  assert((await rows('creator_applications', a, 'status'))[0].status === 'submitted', 'Posted foreign account ID changed another creator');
  checks.push('One-click skip-all and per-account submission isolation');

  const uploadFixture = await signup('uploads');
  const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOs1nVmYGBgYmBgYGBgAAALZgDvHS4cXQAAAABJRU5ErkJggg==', 'base64');
  for (let index = 0; index < 2; index++) {
    const response = await upload(uploadFixture, 'content_sfw_image', 'sample-' + index + '.png', photo, 'image/png');
    assert(response.status === 303 && location(response).searchParams.get('status') === 'content_saved', 'Sequential image upload failed');
  }
  const photos = await rows('creator_files', uploadFixture, 'kind,storage_transfer_status,bucket,storage_path');
  assert(photos.length === 2 && photos.every(file => file.kind === 'content_sfw_image' && file.storage_transfer_status === 'verified'), 'Sequential images were not verified');
  const submittedUpload = await post(uploadFixture, 'submit');
  assert(submittedUpload.status === 303 && location(submittedUpload).pathname === '/creator', 'Upload fixture could not finish onboarding');
  const returnedContent = await page('/creator/onboarding?step=content', uploadFixture);
  const returnedHtml = await returnedContent.text();
  assert(returnedContent.status === 200, 'Returning to content failed');
  assert([...returnedHtml.matchAll(/<label\b[^>]*data-choose-content[^>]*>[\s\S]*?<\/label>/g)].length === 4, 'Returned content pickers missing');
  assert([...returnedHtml.matchAll(/<label\b[^>]*data-choose-content[^>]*>[\s\S]*?<\/label>/g)].every(match => !buttonDisabled(match[0])), 'Submitted creator cannot choose content');
  assert([...returnedHtml.matchAll(/<input\b[^>]*type="file"[^>]*>/g)].every(match => /\smultiple(?:=|\s|>)/.test(match[0])), 'Every content picker must support multiple files');
  const video = execFileSync('/usr/bin/ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:r=10', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'], { timeout: 15000, maxBuffer: 1024 * 1024 });
  for (const kind of ['content_sfw_image', 'content_nsfw_image', 'content_sfw_video', 'content_nsfw_video']) {
    const isVideo = kind.endsWith('_video');
    const result = await upload(uploadFixture, kind, isVideo ? 'return-test.mp4' : 'return-test.png', isVideo ? video : photo, isVideo ? 'video/mp4' : 'image/png', true);
    assert(result.status === 200 && (await result.json()).status === 'content_saved', 'Verified JSON upload after submission failed for ' + kind);
  }
  const beforeEdit = (await rows('creator_applications', uploadFixture, 'updated_at,status'))[0];
  const answerUpdate = await page('/creator-auth/onboarding/draft', uploadFixture, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: 'personal-contact', answers: { full_name: 'Disposable return-flow fixture' }, revision: beforeEdit.updated_at }) });
  assert(answerUpdate.status === 200, 'Returning creator could not autosave answers');
  const afterEdit = (await rows('creator_applications', uploadFixture, 'answers,status'))[0];
  assert(afterEdit.status === 'submitted' && afterEdit.answers.full_name === 'Disposable return-flow fixture', 'Returned answers not saved or approval changed');
  const invalidImage = await upload(uploadFixture, 'content_sfw_image', 'invalid.png', Buffer.from('not an image'), 'image/png', true);
  assert(invalidImage.status === 400 && (await invalidImage.json()).status === 'upload_wrong_type', 'Invalid media must still be rejected');
  checks.push('Dashboard return link, Back/Next navigation, red enabled pickers, all four image/video categories after submission and saved returning answers');
  const memo = Buffer.from('524946462400000057415645666d74201000000001000100401f0000803e0000020010006461746100000000', 'hex');
  const voiceUpload = await upload(uploadFixture, 'voice', 'sample-memo.wav', memo, 'audio/wav');
  assert(voiceUpload.status === 303 && location(voiceUpload).searchParams.get('status') === 'voice_saved', 'Voice upload after optional onboarding failed');
  const saved = await rows('creator_files', uploadFixture, 'kind,storage_transfer_status,bucket,storage_path');
  assert(saved.length === 7 && saved.some(file => file.kind === 'voice' && file.storage_transfer_status === 'verified'), 'Voice sample was not verified');
  checks.push('Sequential photo uploads, post-submission photo/video uploads, invalid media rejection and retained voice memo support');
  // Real public HTTPS + private storage regression above the old 64 MB cap.
  // Keep the fixture on disk so the check also fits the 512 MB app container.
  const fs = require('node:fs');
  const staged = fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'flirt-large-check-'));
  try {
    const path = require('node:path').join(staged, 'short-large.mp4');
    fs.writeFileSync(path, video);
    const size = 80 * 1024 * 1024;
    const free = Buffer.alloc(8); free.writeUInt32BE(size - video.length); free.write('free', 4);
    const fd = fs.openSync(path, 'r+');
    try { fs.writeSync(fd, free, 0, free.length, video.length); fs.writeSync(fd, Buffer.alloc(1), 0, 1, size - 1); } finally { fs.closeSync(fd); }
    const names = ['batch-large-a.mp4', 'batch-large-b.mp4'];
    const started = Date.now();
    const results = await Promise.all(names.map(async name => upload(uploadFixture, 'content_sfw_video', name, await fs.openAsBlob(path, { type: 'video/mp4' }), 'video/mp4', true)));
    for (const result of results) assert(result.status === 200 && (await result.json()).status === 'content_saved', 'Two concurrent videos above 64 MB must save over public HTTPS without upload_busy');
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const stored = await rows('creator_files', uploadFixture, 'original_name,size_bytes,storage_transfer_status');
    for (const name of names) assert(stored.filter(file => file.original_name === name && Number(file.size_bytes) === size && file.storage_transfer_status === 'verified').length === 1, 'Each concurrent video must be saved exactly once');
    checks.push(`Two 80 MB short videos uploaded concurrently over public HTTPS and verified in private storage in ${seconds} seconds (server test connection)`);
  } finally { fs.rmSync(staged, { recursive: true, force: true }); }

  const twin = await request('https://dashboard.tgaiclone.xyz');
  assert(twin.status === 200 && (await twin.text()).includes('Twin'), 'Existing Twin login stopped responding');
  checks.push('Existing Twin HTTPS login still responds');
}
async function cleanup() {
  let failed = false;
  for (const fixture of fixtures) {
    try {
      if (!fixture.id) { const saved = await accountRows(fixture.email); if (saved.length === 1) Object.assign(fixture, saved[0]); }
      if (fixture.id) {
        const savedFiles = await rows('creator_files', fixture, 'bucket,storage_path');
        for (const file of savedFiles) {
          if (!['onboarding-content', 'voice-samples'].includes(file.bucket) || !file.storage_path?.startsWith('creators/' + fixture.id + '/')) throw new Error('Unexpected synthetic storage object');
          await api('/storage/v1/object/' + file.bucket + '/' + file.storage_path, { method: 'DELETE', headers: { Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY } });
        }
        await api('/rest/v1/creator_accounts?id=eq.' + fixture.id + '&email=eq.' + encodeURIComponent(fixture.email), { method: 'DELETE' });
        await api('/auth/v1/admin/users/' + fixture.auth_user_id, { method: 'DELETE' });
        assert((await accountRows(fixture.email)).length === 0, 'Synthetic account remained');
      }
    } catch { failed = true; }
  }
  assert(!failed, 'Synthetic fixture cleanup failed');
}
(async () => {
  let failure;
  try { await main(); } catch (error) { failure = error.message; }
  try { await cleanup(); } catch (error) { failure = (failure ? failure + '; ' : '') + error.message; }
  console.log(JSON.stringify({ passed: !failure, checks, ...(failure ? { error: failure } : { synthetic_fixtures_removed: true }), credentials_logged: false }));
  if (failure) process.exitCode = 1;
})();



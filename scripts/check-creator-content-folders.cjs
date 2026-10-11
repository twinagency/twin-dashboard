const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { resolve } = require('node:path');
const { rmSync } = require('node:fs');
const { NextRequest } = require('next/server');
let identity = { accountId: 'synthetic-owner', readOnly: false }, viewAs = false, conflict = false;
let application = { id: 'synthetic-application', status: 'draft', answers: { preferred_name: 'Synthetic' }, updated_at: '2026-10-11T00:00:00.000Z' };
const db = { from(table) {
  assert.equal(table, 'creator_applications'); let values, write = false; const filters = {};
  const q = { select(){return q}, eq(k,v){filters[k]=v;return q}, order(){return q}, limit(){return q}, update(v){write=true;values=v;return q}, insert(v){write=true;values=v;return q}, single(){return q}, maybeSingle(){return q},
    then(done,failed){ return Promise.resolve().then(() => {
      assert.equal(filters.creator_account_id || values?.creator_account_id, identity.accountId, 'Every read/write is owned');
      if (!write) return { data: structuredClone(application), error: null };
      if (conflict) { conflict = false; application.answers.favorite_food = 'Pizza'; application.updated_at = '2026-10-11T01:00:00.000Z'; return { data: null, error: null }; }
      assert.equal(filters.updated_at, application.updated_at, 'Updates use a revision lease');
      application = { ...application, ...values }; return { data: { id: application.id }, error: null };
    }).then(done,failed); }
  }; return q;
} };
global.__folderFixture = { db, identity: () => identity, viewAs: () => viewAs };
(async () => {
  const outfile = resolve('node_modules/.cache/creator-content-folders.cjs');
  await build({ entryPoints: ['app/creator-auth/content-folders/route.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'folder-fixture', setup(b) {
    b.onResolve({ filter: /^@\/lib\/(creator-session|creator-dashboard-identity|creator-upload-policy|flirt-onboarding|view-as|form-origin|supabase-service)$/ }, args => ({path:args.path, namespace:'fixture'}));
    b.onLoad({ filter: /.*/, namespace:'fixture' }, args => ({ contents: args.path.endsWith('/creator-session') ? 'export const CREATOR_SESSION_COOKIE="creator";' : args.path.endsWith('/creator-dashboard-identity') ? 'export const creatorDashboardIdentity=async()=>globalThis.__folderFixture.identity();' : args.path.endsWith('/view-as') ? 'export const activeViewAs=async()=>globalThis.__folderFixture.viewAs();' : args.path.endsWith('/form-origin') ? 'export const trustedFormOrigin=req=>req.headers.get("origin")==="https://test.example";' : args.path.endsWith('/supabase-service') ? 'export const serviceClient=()=>globalThis.__folderFixture.db;' : 'export const creatorUploadsEditable=status=>!status||status==="draft";export const creatorOnboardingEditable=creatorUploadsEditable;' }));
  } }] });
  const { POST } = require(outfile);
  const post = (body, headers = {}) => POST(new NextRequest('https://test.example/creator-auth/content-folders', {method:'POST',headers:{origin:'https://test.example','content-type':'application/json',...headers},body:JSON.stringify(body)}));
  for (const url of ['http://drive.google.com/drive/folders/test','https://drive.google.com.attacker.invalid/drive/folders/test','https://user:secret@drive.google.com/drive/folders/test','https://127.0.0.1/private','https://dropbox.com/s/file']) assert.equal((await post({url})).status,400);
  assert.equal((await post(null)).status,400);
  const folder = {url:'https://drive.google.com/drive/folders/test'};
  assert.equal((await post(folder, {origin:'https://attacker.invalid'})).status,403);
  assert.equal((await post(folder, {'next-action':'forged'})).status,403);
  viewAs=true;assert.equal((await post(folder)).status,403);viewAs=false;
  identity.readOnly=true;assert.equal((await post(folder)).status,401);identity.readOnly=false;
  conflict=true;assert.equal((await post(folder)).status,200);
  assert.equal(application.answers.favorite_food,'Pizza','Retry preserves concurrent questionnaire edits');
  assert.equal(application.answers.preferred_name,'Synthetic');
  assert.equal(JSON.parse(application.answers.content_folder_links).length,1);
  assert.equal((await post(folder)).status,200);assert.equal(JSON.parse(application.answers.content_folder_links).length,1,'Duplicate links are idempotent');
  application.status='rejected';assert.equal((await post({url:'https://www.dropbox.com/scl/fo/test/folder'})).status,409);
  rmSync(outfile,{force:true});console.log('Folder intake passed: URL validation, origin/session/read-only isolation, revision conflicts preserve questionnaire edits, duplicate links and application locks.');
})().catch(error=>{console.error(error);process.exitCode=1;});

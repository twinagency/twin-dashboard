const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { resolve } = require('node:path');
const { rmSync } = require('node:fs');
const { renderToStaticMarkup } = require('react-dom/server');

let files = [], name = 'Moxy';
global.__optionalIdentity = () => ({ accountId: '11111111-1111-4111-8111-111111111111', name, agencyId: name === 'Moxy' ? 'bc670215-110b-4ea0-8f5c-af3dfe21d253' : null, readOnly: false });
global.__optionalDatabase = { from(table) {
  const result = () => ({ error: null, data: table === 'creator_accounts' ? { display_name: 'Synthetic Creator', email: 'synthetic@example.invalid' } : table === 'creator_files' ? files : null });
  const query = { select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
    single() { return Promise.resolve(result()); }, maybeSingle() { return Promise.resolve(result()); }, then(done) { return Promise.resolve(result()).then(done); } };
  return query;
} };

(async () => {
  const outfile = resolve('node_modules/.cache/moxy-optional-progress.cjs');
  await build({ entryPoints: ['app/creator/onboarding/page.tsx'], outfile, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
    plugins: [{ name: 'isolated-progress-fixtures', setup(build) {
      build.onResolve({ filter: /^(?:@\/components\/.*|@\/lib\/supabase|@\/lib\/creator-dashboard-identity|@\/lib\/creator-session|next\/headers|next\/navigation|next\/link)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), contents:
        args.path.startsWith('@/components/') || args.path === 'next/link'
          ? 'import React from "react";const C=({children})=>React.createElement("div",null,children);export default C;export const Card=C,CardHeader=C,CardContent=C,Input=C,Button=C;export const buttonVariants=()=>"";'
          : args.path.endsWith('/supabase') ? 'export const supabaseAdmin=globalThis.__optionalDatabase;'
          : args.path.endsWith('/creator-dashboard-identity') ? 'export const creatorDashboardIdentity=async()=>globalThis.__optionalIdentity();'
          : args.path.endsWith('/creator-session') ? 'export const CREATOR_SESSION_COOKIE="fixture";'
          : args.path === 'next/headers' ? 'export const cookies=async()=>({get:()=>({value:"fixture"})});'
          : 'export const redirect=()=>{throw Error("unexpected redirect")};'
      }));
    } }],
  });
  try {
    const Page = require(outfile).default;
    const render = async step => renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ step }) }));
    const contentRow = html => html.match(/<li[^>]*data-readiness-item="content"[\s\S]*?<\/li>/)[0];
    for (const [kind, count] of [['content_sfw_image',12],['content_nsfw_image',6],['content_sfw_video',3],['content_nsfw_video',5]]) {
      for (let i=0;i<count;i++) files.push({ kind, storage_transfer_status: 'verified' });
    }
    let html = await render('consent');
    assert.match(contentRow(html), /26 saved files/);
    assert.match(contentRow(html), />Saved</);
    assert.match(html, /No required steps/);
    assert.doesNotMatch(html, /of 4 complete|Optional — not completed/);
    html = await render('content');
    for (const count of [12,6,3,5]) assert.match(html, new RegExp('>' + count + ' saved<'));
    assert.doesNotMatch(html, /Minimum reached|remaining<|of 20 verified|of 30 verified|of 15 verified/);
    files = [{ kind: 'content_sfw_video', storage_transfer_status: 'pending' }];
    html = await render('consent');
    assert.match(contentRow(html), /0 saved files/); assert.doesNotMatch(contentRow(html), />Saved</);
    files = [{ kind: 'content', storage_transfer_status: 'verified' }];
    html = await render('consent'); assert.match(contentRow(html), /1 saved file\./); assert.match(contentRow(html), /Earlier uploads: 1/);
    name = 'Twin'; files = [{ kind: 'content_sfw_image', storage_transfer_status: 'verified' }];
    html = await render('content'); assert.match(html, /1 saved/); assert.doesNotMatch(html, /of 20 verified/);
    name = 'Tether';
    html = await render('content'); assert.match(html, /1 of 20 verified/); assert.match(html, /19(?:<!-- -->)? remaining/);
    console.log('Moxy optional progress: 26 saved files remain visible below legacy quotas; pending files excluded; legacy saved content included; direct Twin optional intake and other agency quotas preserved.');
  } finally { rmSync(outfile, { force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });

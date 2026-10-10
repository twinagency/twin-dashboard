const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { resolve } = require('node:path');
const { rmSync } = require('node:fs');
const { renderToStaticMarkup } = require('react-dom/server');

let brand = 'Moxy', application = null, consent = null, files = [], readOnly = false, cloneIds = [];
global.__setupIdentity = () => ({ accountId: '11111111-1111-4111-8111-111111111111', name: brand,
  agencyId: brand === 'Moxy' ? 'bc670215-110b-4ea0-8f5c-af3dfe21d253' : null, readOnly, cloneIds });
global.__setupDatabase = { from(table) {
  const result = () => ({ error: null, data: table === 'creator_accounts' ? { display_name: 'Synthetic Creator', email: 'synthetic@example.invalid' }
    : table === 'creator_applications' ? application : table === 'creator_consents' ? consent : table === 'creator_files' ? files : null });
  const query = { select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
    single() { return Promise.resolve(result()); }, maybeSingle() { return Promise.resolve(result()); }, then(done) { return Promise.resolve(result()).then(done); } };
  return query;
} };

(async () => {
  const outfile = resolve('node_modules/.cache/creator-setup-ui.cjs');
  await build({ entryPoints: ['app/creator/onboarding/page.tsx'], outfile, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
    plugins: [{ name: 'creator-setup-render-fixtures', setup(b) {
      b.onResolve({ filter: /\.module\.css$/ }, args => ({ path: args.path, namespace: 'fixture-css' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture-css' }, () => ({ contents: 'export default {};' }));
      b.onResolve({ filter: /^(?:@\/components\/.*|@\/lib\/supabase|@\/lib\/creator-dashboard-identity|@\/lib\/creator-session|next\/headers|next\/navigation|next\/link)$/ }, args => {
        if (args.path === '@/components/CreatorSetupLayout') return { path: resolve('components/CreatorSetupLayout.tsx') };
        return { path: args.path, namespace: 'fixture' };
      });
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
        let contents;
        if (args.path === 'next/link') contents = 'import React from "react";export default ({children,...p})=>React.createElement("a",p,children);';
        else if (args.path.endsWith('/CreatorQuestionnaireWizard')) contents = 'import React from "react";export default ({page,initialAnswers,initialRevision,locked,optional})=>React.createElement("div",{"data-fixture-questionnaire":page.slug,"data-locked":locked,"data-optional":optional,"data-revision":initialRevision},Object.entries(initialAnswers).map(([name,value])=>React.createElement("input",{key:name,name,defaultValue:value,disabled:locked})));';
        else if (args.path.endsWith('/CreatorOnboardingActionForm')) contents = 'import React from "react";export default ({children,consentBeforeSubmit,successStatuses})=>React.createElement("form",{"data-fixture-consent-submit":!!consentBeforeSubmit,"data-success-statuses":successStatuses.join(",")},children);';
        else if (args.path.endsWith('/CreatorUploadForm')) contents = 'import React from "react";export default ({kind,locked})=>React.createElement("div",{"data-fixture-upload":kind,"data-locked":locked});';
        else if (args.path.endsWith('/CreatorContentGallery')) contents = 'import React from "react";export default ({kind})=>React.createElement("div",{"data-fixture-gallery":kind});';
        else if (args.path.endsWith('/TwinWordmark')) contents = 'import React from "react";export default ()=>React.createElement("span",null,"Twin");';
        else if (args.path.startsWith('@/components/')) contents = 'import React from "react";const C=({children,...p})=>React.createElement("div",p,children);export default C;export const Card=C,CardHeader=C,CardContent=C;export const Input=p=>React.createElement("input",p);export const Button=({children,size,variant,...p})=>React.createElement("button",p,children);export const buttonVariants=()=>"";';
        else if (args.path.endsWith('/supabase')) contents = 'export const supabaseAdmin=globalThis.__setupDatabase;';
        else if (args.path.endsWith('/creator-dashboard-identity')) contents = 'export const creatorDashboardIdentity=async()=>globalThis.__setupIdentity();';
        else if (args.path.endsWith('/creator-session')) contents = 'export const CREATOR_SESSION_COOKIE="fixture";';
        else if (args.path === 'next/headers') contents = 'export const cookies=async()=>({get:()=>({value:"fixture"})});';
        else contents = 'export const redirect=path=>{throw Error("redirect:"+path)};';
        return { resolveDir: process.cwd(), contents };
      });
    } }],
  });
  try {
    const Page = require(outfile).default;
    const render = async params => renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params || {}) }));
    let html = await render();
    assert.match(html, /data-creator-setup-brand="moxy"/);
    assert.match(html, /src="\/moxy\/logo.png"/);
    assert.equal((html.match(/data-creator-setup-tab=/g) || []).length, 2);
    assert.match(html, /data-onboarding-active-step="questionnaire"/);
    assert.match(html, /data-fixture-questionnaire="quick-about"/);
    assert.match(html, /Go to dashboard/);
    assert.match(html, /href="\/creator"/);
    assert.match(html, /Make it yours\./);
    assert.match(html, /Set up your AI, in your own time\./);
    assert.match(html, /Choose either section to get started/);
    assert.doesNotMatch(html, /data-onboarding-step-card|Voice|Consent &amp; submit|Step 1/);

    files = [{ kind: 'content_sfw_image', storage_transfer_status: 'verified' }, { kind: 'content_sfw_image', storage_transfer_status: 'pending' }, { kind: 'content', storage_transfer_status: 'verified' }];
    for (const step of ['content', 'voice', 'consent']) {
      html = await render({ step });
      assert.match(html, /data-onboarding-active-step="content"/);
      assert.match(html, /2 saved files/);
      assert.equal((html.match(/data-fixture-upload=/g) || []).length, 4);
      assert.match(html, /data-fixture-gallery="content"/);
      assert.doesNotMatch(html, /data-fixture-upload="voice"|Voice|Minimum reached|Not complete/);
      assert.match(html, /data-fixture-consent-submit="true"/);
      assert.match(html, /name="legal_name"/);
      assert.match(html, /name="agreed"/);
      assert.match(html, /name="action" value="submit"/);
      assert.match(html, /authorize Moxy to use them to build and operate my AI creator profile under my agreement/);
      assert.doesNotMatch(html, /name="legal_name"[^>]*required/);
      assert.doesNotMatch(html, /<button[^>]*disabled[^>]*>Submit onboarding/);
    }

    application = { id: 'fixture', status: 'submitted', submitted_at: '2026-10-10T01:00:00Z', updated_at: '2026-10-10T01:00:00Z', answers: {} };
    html = await render({ step: 'content' });
    assert.match(html, /data-onboarding-application-state="Submitted"/);
    assert.match(html, /name="action" value="consent"/);
    assert.match(html, />Save consent/);
    assert.doesNotMatch(html, /data-fixture-upload="[^"]+" data-locked="true"/);
    consent = { id: 'consent-fixture', legal_name: 'Synthetic Creator' };
    html = await render({ step: 'content' });
    assert.match(html, /Consent signed by Synthetic Creator/);
    assert.doesNotMatch(html, /name="legal_name"/);
    assert.match(html, /<button[^>]*disabled[^>]*>Application submitted/);
    application.status = 'approved';
    html = await render({ step: 'questionnaire' });
    assert.match(html, /data-locked="false"/);
    assert.match(html, /data-onboarding-application-state="Approved"/);
    readOnly = true;
    html = await render({ step: 'content' });
    assert.match(html, /data-fixture-upload="content_sfw_image" data-locked="true"/);
    assert.match(html, /Application locked/);

    brand = 'Twin'; application = null; consent = null; readOnly = false;
    html = await render();
    assert.doesNotMatch(html, /data-creator-setup-brand/);
    assert.equal((html.match(/data-onboarding-step-card=/g) || []).length, 4);
    assert.match(html, /data-onboarding-step-card="voice"/);
    assert.match(html, /data-onboarding-step-card="consent"/);
    html = await render({ step: 'voice' });
    assert.match(html, /data-fixture-upload="voice"/);
    brand = 'Moxy'; cloneIds = ['live-clone'];
    await assert.rejects(() => render(), /redirect:\/creator\/ppvs/);
    console.log('Creator setup UI passed: Moxy has two free sections, legacy URLs map to content, inline consent preserves optional and post-submission behaviour, uploads and other-brand flows remain available.');
  } finally { rmSync(outfile, { force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });

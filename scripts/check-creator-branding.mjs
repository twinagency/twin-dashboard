// Renders the real creator auth and onboarding components with local-only
// dependencies. No production account, session, database or network is used.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright";

const root = process.cwd();
const out = path.join(root, "test-results/creator-workspace/branding");
mkdirSync(out, { recursive: true });

const source = (file) => readFileSync(path.join(root, file), "utf8");
const resolveLocalModule = (specifier) => {
  const base = path.join(root, specifier.slice(2));
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, path.join(base, "index.tsx"), path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Unable to resolve local module ${specifier}`);
};

const screenFiles = [
  "components/CreatorLoginScreen.tsx",
  "components/CreatorSignupScreen.tsx",
  "components/CreatorForgotPasswordScreen.tsx",
  "components/CreatorResetPasswordScreen.tsx",
];
for (const file of screenFiles) {
  const text = source(file);
  assert.doesNotMatch(text, /brand\s*=\s*["']twin["']/, `${file} must not silently fall back to Twin`);
  assert.doesNotMatch(text, /brand\?\s*:\s*CreatorAuthBrand/, `${file} must require an explicit brand`);
  assert.match(text, /brand\s*:\s*CreatorAuthBrand/, `${file} must type brand as required`);
}
// Execute the recovery client and logout handler, including safe return URLs,
// rather than requiring a specific spelling of window.location.replace.
execFileSync(process.execPath, ["scripts/check-creator-flow-ui.cjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/check-creator-onboarding-failures.cjs"], { stdio: "inherit" });

const wrappers = new Map([
  ["app/creator/login/page.tsx", ["CreatorLoginScreen", "twin"]],
  ["app/creator/signup/page.tsx", ["CreatorSignupScreen", "twin"]],
  ["app/creator/forgot-password/page.tsx", ["CreatorForgotPasswordScreen", "twin"]],
  ["app/creator/reset-password/page.tsx", ["CreatorResetPasswordScreen", "twin"]],
  ["app/creator/tether/login/page.tsx", ["CreatorLoginScreen", "tether"]],
  ["app/creator/tether/signup/page.tsx", ["CreatorSignupScreen", "tether"]],
  ["app/creator/tether/forgot-password/page.tsx", ["CreatorForgotPasswordScreen", "tether"]],
  ["app/creator/tether/reset-password/page.tsx", ["CreatorResetPasswordScreen", "tether"]],
  ["app/creator/link/login/page.tsx", ["CreatorLoginScreen", "link"]],
  ["app/creator/link/signup/page.tsx", ["CreatorSignupScreen", "link"]],
  ["app/creator/link/forgot-password/page.tsx", ["CreatorForgotPasswordScreen", "link"]],
  ["app/creator/link/reset-password/page.tsx", ["CreatorResetPasswordScreen", "link"]],
]);
for (const [file, [component, brand]] of wrappers) {
  assert.match(source(file), new RegExp(`<${component}[^>]*brand=["']${brand}["']`), `${file} must select ${brand} explicitly`);
}

const routingSource = source("lib/creator-routing.ts");
for (const [name, route] of [
  ["LINK_CREATOR_LOGIN_PATH", "/creator/link/login"],
  ["LINK_CREATOR_SIGNUP_PATH", "/creator/link/signup"],
  ["LINK_CREATOR_FORGOT_PASSWORD_PATH", "/creator/link/forgot-password"],
  ["LINK_CREATOR_RESET_PASSWORD_PATH", "/creator/link/reset-password"],
]) {
  assert.match(routingSource, new RegExp(`export const ${name} = ["']${route.replaceAll("/", "\\/")}["']`), `${name} must remain on the dedicated Link creator route`);
}
assert.match(source("lib/link-creator-signup.ts"), /LINK_CREATOR_SIGNUP_ACTION\s*=\s*["']\/creator-auth\/link\/signup["']/,
  "Link creator signup must post to its dedicated server-verified action");

const frameSource = source("components/CreatorAuthFrame.tsx");
assert.match(frameSource, /CreatorAuthBrand\s*=\s*["']link["']\s*\|\s*["']twin["']\s*\|\s*["']tether["']/,
  "The shared creator frame must model Link as an explicit brand");
assert.match(frameSource, /brand === ["']link["'][\s\S]*?<LynqLoginShell[\s\S]*?creatorAuth/,
  "Link creator auth must reuse the existing LYNQ login presentation");

const loginShellSource = source("app/lynq/LoginShell.tsx");
assert.match(loginShellSource, /data-creator-auth-brand=\{creatorAuth \? ["']link["'] : undefined\}/);
assert.match(loginShellSource, /<TwinWordmark agencyName=["']LYNQ["'] \/>/,
  "The Link auth shell must use the existing LYNQ wordmark");
const wordmarkSource = source("components/TwinWordmark.tsx");
assert.match(wordmarkSource, /data-lynq-core=["']particles["'][\s\S]*?<IntelligenceCoreIcon/,
  "LYNQ must keep the original IntelligenceCoreIcon particle canvas");
const coreSource = source("components/IntelligenceCoreIcon.tsx");
assert.match(coreSource, /prefers-reduced-motion: reduce/);
assert.match(coreSource, /requestAnimationFrame\(draw\)/);

const linkCss = source("app/lynq/login.module.css");
assert.match(linkCss, /\.card form input\s*\{[\s\S]*?background:\s*#ffffff;[\s\S]*?color:\s*#19191f;/,
  "Link auth inputs must keep dark typed text on white fields");
assert.match(linkCss, /\.card form input:-webkit-autofill[\s\S]*?-webkit-text-fill-color:\s*#19191f !important;[\s\S]*?-webkit-box-shadow:\s*0 0 0 1000px #ffffff inset !important;/,
  "Link auth autofill must keep dark text on white fields");
assert.match(linkCss, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.wash\s*\{\s*animation:\s*none;/,
  "Link auth decoration must stop when reduced motion is requested");

const layoutSource = source("app/layout.tsx");
assert.match(layoutSource, /const link = publicPortal === ["']link["'] \|\| isLynq\(creator\?\.name\)/,
  "Creator metadata must recognize public routes and verified-session LYNQ creators");
assert.match(layoutSource, /const tether = publicPortal === ["']tether["'] \|\| creator\?\.name === TETHER_PORTAL\.name/,
  "Creator metadata must preserve public routes and verified-session Tether creators");
assert.match(layoutSource, /title:\s*link \? ["']LYNQ creator workspace["']/);
assert.match(layoutSource, /url:\s*link \? ["']\/lynq\/icon\.svg["'] : tether \? ["']\/tether\/icon\.svg["']/,
  "Creator metadata must keep LYNQ and Tether favicons separate");
assert.match(layoutSource, /type:\s*link \|\| tether \? ["']image\/svg\+xml["'] : ["']image\/png["']/);

const onboardingSource = source("app/creator/onboarding/page.tsx");
assert.doesNotMatch(onboardingSource, /Twin\/Lovable|Lovable/,
  "Creator onboarding must not expose the implementation platform");
assert.match(onboardingSource, /const link = isLynq\(creator\.name\)/,
  "Creator onboarding must derive Link branding from verified identity");
assert.match(onboardingSource, /data-creator-onboarding-brand=\{tether \? ["']tether["'] : link \? ["']link["'] : moxy \? ["']moxy["'] : ["']twin["']\}/);
assert.match(onboardingSource, /link \? ["']LYNQ creator onboarding["']/);
assert.doesNotMatch(onboardingSource, /export const metadata\s*=/,
  "Onboarding must inherit verified-session creator metadata from the root layout");
assert.doesNotMatch(source("app/creator/page.tsx"), /export const metadata\s*=/,
  "The private creator dashboard must inherit verified Link or Tether metadata from the root layout");

for (const [file, forbidden] of [["public/tether/icon.svg", /Twin/i], ["public/lynq/icon.svg", /Twin/i]]) {
  const iconPath = path.join(root, file);
  assert.equal(existsSync(iconPath), true, `${file} is missing`);
  const iconSource = readFileSync(iconPath, "utf8");
  assert.match(iconSource, /<svg\b/);
  assert.doesNotMatch(iconSource, forbidden, `${file} must not expose Twin branding`);
}

const fixture = `
import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import Login from './components/CreatorLoginScreen';
import Signup from './components/CreatorSignupScreen';
import Forgot from './components/CreatorForgotPasswordScreen';
import Reset from './components/CreatorResetPasswordScreen';
import Onboarding from './app/creator/onboarding/page';
import {CreatorContentUploadProvider} from './components/CreatorContentUploadProvider';

const kind = location.pathname.split('/').filter(Boolean).at(-1) || 'login';
const brand = location.pathname.includes('/creator/link/')
  ? 'link'
  : location.pathname.includes('/creator/tether/')
    ? 'tether'
    : 'twin';
const params = Object.fromEntries(new URLSearchParams(location.search));
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.__creatorDraftRequests=[];
globalThis.fetch=async(input,init)=>{
  const requestUrl=new URL(typeof input==='string'?input:input.url,location.origin);
  if(requestUrl.pathname==='/creator-auth/onboarding/draft'){
    const payload=JSON.parse(String(init?.body||'{}'));
    globalThis.__creatorDraftRequests.push(payload);
    return new Response(JSON.stringify({ok:true,revision:'fixture-revision-'+globalThis.__creatorDraftRequests.length}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(requestUrl.pathname==='/creator-auth/files')return new Response(JSON.stringify({files:[],hasMore:false}),{status:200,headers:{'content-type':'application/json'}});
  if(requestUrl.pathname==='/creator-auth/uploads')return new Response(JSON.stringify({uploads:[]}),{status:200,headers:{'content-type':'application/json'}});
  return nativeFetch(input,init);
};
function App(){
  const [node,setNode]=useState(null);
  useEffect(()=>{
    let active=true;
    (async()=>{
      const rendered=kind==='login'
        ? await Login({searchParams:Promise.resolve(params),brand})
        : kind==='signup'
          ? await Signup({searchParams:Promise.resolve(params),brand})
          : kind==='onboarding'
            ? await Onboarding({searchParams:Promise.resolve(params)})
            : null;
      if(active&&rendered)setNode(rendered);
    })();
    return()=>{active=false};
  },[]);
  if(kind==='forgot-password')return <Forgot brand={brand}/>;
  if(kind==='reset-password')return <Reset brand={brand}/>;
  return kind==='onboarding' ? <CreatorContentUploadProvider accountId="11111111-1111-4111-8111-111111111111">{node}</CreatorContentUploadProvider> : node;
}
createRoot(document.getElementById('root')).render(<App/>);
`;

const linkMock = `
import React from 'react';
export const useLinkStatus=()=>({pending:false});export default function Link({children,href,...props}){return <a {...props} href={String(href)}>{children}</a>}
`;
const headersMock = `export async function cookies(){return {get(){return {value:'local-creator-session'}}}}`;
const navigationMock = `export function redirect(path){throw new Error('Unexpected redirect to '+path)} export function useRouter(){return {refresh(){}}}`;
const identityMock = `
export async function creatorDashboardIdentity(){
  const brand=new URLSearchParams(location.search).get('fixture_brand');
  const name=brand==='moxy'?'Moxy':brand==='link'?'LYNQ':brand==='tether'?'Tether':'Twin';
  const agencyId=brand==='moxy'?'bc670215-110b-4ea0-8f5c-af3dfe21d253':brand==='link'?'74b03b70-397e-49ab-841f-8adb8241d87d':brand==='tether'?'fixture-tether':null;
  return {accountId:'11111111-1111-4111-8111-111111111111',userId:'22222222-2222-4222-8222-222222222222',name,creatorName:'Fixture Creator',cloneIds:[],onboarded:false,agencyId};
}
`;
const databaseMock = `
const rows={
  creator_accounts:{display_name:'Fixture Creator',email:'creator@example.test'},
  creator_onboarding_progress:{questionnaire_completed:false,content_completed:false,voice_completed:false},
  creator_applications:{id:'application-fixture',status:'draft',answers:{full_name:'Fixture Creator',preferred_name:'Fixture',platforms:'Telegram',boundaries:'Keep private details private.'},updated_at:'2026-09-12T00:00:00.000Z'},
  creator_files:[],
  creator_consents:null,
};
function completeContentFiles(){
  const requirements=[
    ['content_sfw_image',20,'image/jpeg','sfw-image.jpg'],
    ['content_nsfw_image',30,'image/jpeg','nsfw-image.jpg'],
    ['content_sfw_video',15,'video/mp4','sfw-video.mp4'],
    ['content_nsfw_video',30,'video/mp4','nsfw-video.mp4'],
  ];
  return requirements.flatMap(([kind,count,mime_type,original_name])=>Array.from({length:count},(_,index)=>({
    id:kind+'-'+index,
    kind,
    mime_type,
    original_name,
    size_bytes:1024,
    storage_transfer_status:'verified',
  })));
}
function query(table){
  const result=()=>{
    const complete=new URLSearchParams(location.search).get('fixture_complete')==='1';
    const submitted=new URLSearchParams(location.search).get('fixture_submitted')==='1';
    const data=submitted&&table==='creator_applications' ? {...rows.creator_applications,status:'submitted',submitted_at:'2026-10-12T00:00:00Z'} : complete&&table==='creator_onboarding_progress'
      ? {questionnaire_completed:true,content_completed:true,voice_completed:true}
      : complete&&table==='creator_consents'
        ? {id:'consent-fixture',legal_name:'Fixture Creator',signed_at:'2026-09-12T00:00:00.000Z'}
        : complete&&table==='creator_files'
          ? completeContentFiles()
        : rows[table]??null;
    return Promise.resolve({data,error:null});
  };
  const chain={select(){return chain},eq(){return chain},order(){return chain},limit(){return chain},single(){return result()},maybeSingle(){return result()},then(resolve,reject){return result().then(resolve,reject)}};
  return chain;
}
export const supabaseAdmin={from:query};
`;
const supabaseClientMock = `
export function createClient(){return {auth:{
  resetPasswordForEmail:async(email,options)=>{globalThis.__creatorResetRequest={email,redirectTo:options?.redirectTo};return {error:null}},
  getSession:async()=>({data:{session:{user:{id:'local-user'}}}}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
  updateUser:async()=>({error:null}),
  signOut:async()=>({error:null}),
}}}
`;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bundle = await build({
  stdin: { contents: fixture, resolveDir: root, sourcefile: "creator-branding-fixture.tsx", loader: "tsx" },
  bundle: true,
  write: false,
  outfile: path.join(out, "bundle.js"),
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  loader: { ".css": "local-css" },
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: 'var process={env:{NODE_ENV:"production"},browser:true};' },
  plugins: [{
    name: "creator-branding-fixtures",
    setup(builder) {
      const mocks = new Map([
        ["next/link", [linkMock, "jsx"]],
        ["next/headers", [headersMock, "js"]],
        ["next/navigation", [navigationMock, "js"]],
        ["@/lib/creator-dashboard-identity", [identityMock, "js"]],
        ["@/lib/supabase", [databaseMock, "js"]],
        ["@supabase/supabase-js", [supabaseClientMock, "js"]],
      ]);
      for (const [specifier, [contents, loader]] of mocks) {
        builder.onResolve({ filter: new RegExp(`^${escapeRegExp(specifier)}$`) }, () => ({ path: specifier, namespace: "branding-mock" }));
        builder.onLoad({ filter: /.*/, namespace: "branding-mock" }, (args) => {
          const value = mocks.get(args.path);
          return value ? { contents: value[0], loader: value[1], resolveDir: root } : null;
        });
      }
      builder.onResolve({ filter: /^@\// }, (args) => ({ path: resolveLocalModule(args.path) }));
    },
  }],
});

const javascript = bundle.outputFiles.find((file) => file.path.endsWith(".js"))?.text;
assert.ok(javascript, "Creator branding fixture JavaScript was not built");
const moduleCss = bundle.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
const globalCss = await postcss([tailwind()]).process('@import "./app/globals.css";\n@import "./app/creator-workspace.css";', {
  from: path.join(root, "creator-branding-verification.css"),
});
const styles = `${globalCss.css}\n${moduleCss}`;
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{margin:0;font-family:Arial,sans-serif}html{--font-sans:Arial;--font-display:Arial;--font-heading:Arial}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/styles.css") { res.setHeader("content-type", "text/css"); return res.end(styles); }
  if (url.pathname === "/bundle.js") { res.setHeader("content-type", "application/javascript; charset=utf-8"); return res.end(javascript); }
  res.setHeader("content-type", "text/html; charset=utf-8");
  return res.end(html);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes("--twin-onboarding-preview")) {
  console.log(`TWIN ONBOARDING PREVIEW: ${origin}/creator/onboarding?fixture_brand=twin`);
  await new Promise((resolve) => {
    const close = () => server.close(resolve);
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
  process.exit(0);
}
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const expectations = {
  twin: {
    name: "Twin",
    headings: { login: "Sign in", signup: "Create account", "forgot-password": "Reset password", "reset-password": "New password", onboarding: "Follow these two simple steps to create your AI clone." },
    authBase: "/creator",
    signupAction: "/creator-auth/signup",
  },
  tether: {
    name: "Tether",
    headings: { login: "Sign in to Tether", signup: "Join Tether", "forgot-password": "Reset password", "reset-password": "New password", onboarding: "Build your Tether digital clone" },
    input: { color: "rgb(8, 10, 14)", background: "rgb(255, 255, 255)", caret: "rgb(8, 10, 14)" },
    authBase: "/creator/tether",
    signupAction: "/creator-auth/tether/signup",
  },
  link: {
    name: "LYNQ",
    headings: { login: "Sign in to LYNQ", signup: "Join LYNQ", "forgot-password": "Reset password", "reset-password": "New password", onboarding: "Build your LYNQ digital clone" },
    input: { color: "rgb(25, 25, 31)", background: "rgb(255, 255, 255)", caret: "rgb(25, 25, 31)" },
    authBase: "/creator/link",
    signupAction: "/creator-auth/link/signup",
  },
};
const evidence = [];

try {
  for (const [brand, expectation] of Object.entries(expectations)) {
    for (const [route, heading] of Object.entries(expectation.headings)) {
      for (const width of [390, 1440]) {
        const viewport = width < 1024 ? "mobile" : "desktop";
        const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: "light", reducedMotion: "no-preference" });
        const runtimeErrors = [];
        page.on("pageerror", (error) => runtimeErrors.push(error.message));
        const target = route === "onboarding"
          ? `${origin}/creator/onboarding?fixture_brand=${brand}`
          : `${origin}${expectation.authBase}/${route}`;
        await page.goto(target, { waitUntil: "networkidle" });
        await page.getByRole("heading", { name: heading, exact: true }).waitFor();
        const marker = route === "onboarding"
          ? `[data-creator-onboarding-brand='${brand}']`
          : brand === "twin"
            ? "body"
            : `[data-creator-auth-brand='${brand}']`;
        assert.equal(await page.locator(marker).count(), 1, `${brand} ${route} must render its explicit presentation`);
        const visibleText = await page.locator("body").innerText();
        assert.match(visibleText, new RegExp(expectation.name, "i"));
        assert.doesNotMatch(visibleText, /Lovable/i, `${brand} ${route} must not visibly expose Lovable`);
        if (brand !== "twin") assert.doesNotMatch(visibleText, /\bTwin\b/i, `${brand} ${route} must not visibly leak Twin`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${brand} ${route} must not overflow at ${width}px`);

        if (brand === "link") {
          const originalCore = page.locator('[data-lynq-core="particles"] canvas:visible');
          await originalCore.waitFor();
          assert.equal(await originalCore.count(), 1, `${route} must render one original LYNQ particle core`);
          const firstFrame = await originalCore.evaluate((canvas) => canvas.toDataURL());
          await page.waitForTimeout(180);
          assert.notEqual(await originalCore.evaluate((canvas) => canvas.toDataURL()), firstFrame, `${route} must keep the original particle core animated`);
        }

        if (route !== "onboarding") {
          const hrefs = await page.locator("a").evaluateAll((links) => links.map((link) => link.getAttribute("href")).filter(Boolean));
          for (const href of hrefs) assert.match(href, new RegExp(`^${expectation.authBase.replaceAll("/", "\\/")}\/`), `${brand} ${route} contains a cross-brand creator link: ${href}`);

          const inputs = page.locator("input:not([type='hidden'])");
          await inputs.first().waitFor();
          const inputStyles = await inputs.evaluateAll((nodes) => nodes.map((input) => {
            const computed = getComputedStyle(input);
            return { color: computed.color, backgroundColor: computed.backgroundColor, caretColor: computed.caretColor, autocomplete: input.autocomplete };
          }));
          assert.ok(inputStyles.length > 0, `${brand} ${route} must render its auth fields`);
          for (const input of inputStyles) {
            if (expectation.input) {
              assert.equal(input.color, expectation.input.color, `${brand} ${route} typed text must be dark`);
              assert.equal(input.backgroundColor, expectation.input.background, `${brand} ${route} fields must stay white`);
              assert.equal(input.caretColor, expectation.input.caret, `${brand} ${route} caret must remain visible`);
            }
          }

          const form = page.locator("form").first();
          if (route === "login") {
            assert.equal(await form.getAttribute("action"), "/creator-auth/login");
            assert.equal(await form.locator('input[name="portal"]').getAttribute("value"), brand);
          }
          if (route === "signup") assert.equal(await form.getAttribute("action"), expectation.signupAction);
          if (route === "forgot-password") {
            await inputs.first().fill(`${brand}@example.test`);
            await page.getByRole("button", { name: "Send reset link", exact: true }).click();
            await page.getByText("Check your email for the password reset link.", { exact: true }).waitFor();
            const resetRequest = await page.evaluate(() => globalThis.__creatorResetRequest);
            assert.equal(resetRequest.email, `${brand}@example.test`);
            const resetDestination = new URL(resetRequest.redirectTo);
            assert.equal(resetDestination.origin, origin, `${brand} recovery must stay on the current origin`);
            assert.equal(resetDestination.pathname, `${expectation.authBase}/reset-password`, `${brand} recovery must return to the matching branded reset page`);
            assert.equal(resetDestination.search, "?next=%2Fcreator", `${brand} recovery must preserve the safe default creator destination`);
          }

          if (brand === "tether") {
            const desktopHero = page.locator("main > div.relative.z-10 > section").first();
            assert.equal(await desktopHero.isVisible(), width >= 1024, `${route} must preserve the Tether desktop hero breakpoint`);
          }
        } else if (brand === "twin") {
          assert.equal(await page.locator('[data-creator-setup-tab]').count(), 2, 'Twin uses Questionnaire and Content');
          assert.equal(await page.locator('[data-onboarding-hub]').count(), 0, 'the profile opens directly');
          await page.getByLabel('Setup menu', { exact: true }).click();
          assert.equal(await page.getByRole('link', { name: 'Go to dashboard' }).getAttribute('href'), '/creator');
          await page.getByLabel('Setup menu', { exact: true }).click();
          await page.locator('[data-creator-setup-tab="questionnaire"]').click();
          const questionnaire = page.locator('[data-questionnaire-page="quick-v2-introduction"]');
          await questionnaire.waitFor();
          assert.doesNotMatch(await questionnaire.innerText(), /Section \d of/);
          await questionnaire.locator('[name="preferred_name"]').fill('Autosaved Creator');
          await questionnaire.locator('[data-save-state="saved"]').waitFor();
          const requests = await page.evaluate(() => globalThis.__creatorDraftRequests);
          assert.equal(requests.at(-1).answers.preferred_name, 'Autosaved Creator');
          assert.deepEqual(Object.keys(requests.at(-1).answers), ['preferred_name'], 'save only edited fields');
          await questionnaire.getByRole('button', { name: 'Continue', exact: true }).click();
          await page.locator('[data-questionnaire-page="quick-v2-personal"]').waitFor();
          for (const [section, targetSection] of Object.entries({ 'personal-contact': 'quick-v2-account', appearance: 'quick-v2-personal', relationships: 'quick-v2-preferences' })) {
            await page.goto(`${origin}/creator/onboarding?fixture_brand=twin&step=questionnaire&section=${section}`, { waitUntil: 'networkidle' });
            assert.equal(await page.locator(`[data-questionnaire-page='${targetSection}']`).count(), 1);
          }
          await page.goto(`${origin}/creator/onboarding?fixture_brand=twin&step=content`, { waitUntil: 'networkidle' });
          assert.equal(await page.locator('[data-combined-content-intake]').count(), 1);
          await page.getByLabel('Setup menu', { exact: true }).click();
          await page.getByRole('link', { name: 'Review and finish', exact: true }).click();
          await page.getByRole('button', { name: 'Submit onboarding', exact: true }).waitFor();
          assert.equal(await page.getByRole('button', { name: 'Submit onboarding', exact: true }).isVisible(), true);
          assert.equal(await page.getByRole('button', { name: 'Submit onboarding', exact: true }).isEnabled(), true);
          for (const designBrand of ['moxy', 'twin']) {
            await page.goto(`${origin}/creator/onboarding?fixture_brand=${designBrand}&step=content&review=1`, { waitUntil: 'networkidle' });
            await page.getByRole('heading', { name: 'Ready to send?', exact: true }).waitFor();
            assert.equal(await page.locator('[name="agreed"]').isChecked(), false);
            assert.equal(await page.locator('[name="legal_name"]').inputValue(), '', 'optional consent is not prefilled or fabricated');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            await page.screenshot({path:path.join(out,`${designBrand}-${width}-review.png`),fullPage:true});
            await page.goto(`${origin}/creator/onboarding?fixture_brand=${designBrand}&fixture_submitted=1&complete=1`, { waitUntil: 'networkidle' });
            await page.getByRole('heading', { name: 'You’re all set.', exact: true }).waitFor();
            assert.equal(await page.getByText('You can add content later', { exact: true }).isVisible(), true);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            await page.screenshot({path:path.join(out,`${designBrand}-${width}-complete.png`),fullPage:true});
          }

        } else {
          assert.equal(await page.locator("[data-onboarding-hub]").count(), 1, `${brand} onboarding must open on the compact hub`);
          assert.equal(await page.locator("[data-onboarding-step-card]").count(), 4, `${brand} onboarding hub must show four step cards`);
          assert.equal(await page.locator('form[action="/creator-auth/logout"]').count(), 1, `${brand} onboarding must retain creator-only logout`);
          assert.equal(await page.getByRole("link", { name: "Dashboard", exact: true }).getAttribute("href"), "/creator");

          for (const step of ["questionnaire", "content", "voice", "consent"]) {
            await page.goto(`${origin}/creator/onboarding?fixture_brand=${brand}&step=${step}`, { waitUntil: "networkidle" });
            assert.equal(await page.locator(`[data-onboarding-active-step='${step}']`).count(), 1, `${brand} must open only the requested ${step} step`);
            if (step === "questionnaire") assert.equal(await page.getByRole("button", { name: brand === "twin" ? "Back" : "Save and return to onboarding", exact: true }).count(), 1, `${brand} questionnaire must offer a save-aware return to the hub`);
            else {
              const previous = { content: "questionnaire", voice: "content", consent: "voice" }[step];
              const next = { content: "voice", voice: "consent" }[step];
              assert.equal(await page.locator(`[data-onboarding-back='${previous}']`).first().getAttribute("href"), `/creator/onboarding?step=${previous}`, `${brand} ${step} must navigate to the previous step`);
              if (next) assert.equal(await page.locator(`[data-onboarding-next='${next}']`).first().getAttribute("href"), `/creator/onboarding?step=${next}`, `${brand} ${step} must navigate to the next step`);
              else assert.ok(await page.locator('a[href="/creator"]').count() > 0, `${brand} final step must offer the dashboard`);
            }
            const actions = new Set(await page.locator("form").evaluateAll((forms) => forms.map((form) => form.getAttribute("action")).filter(Boolean)));
            if (step === "questionnaire") {
              const sectionSlug = brand === "twin" ? "quick-about" : "personal-contact";
              const questionnaire = page.locator(`[data-questionnaire-page='${sectionSlug}']`);
              await questionnaire.waitFor();
              const questionNames = await questionnaire.locator("input[name]:not([type='hidden']), textarea[name]").evaluateAll((fields) => [...new Set(fields.map((field) => field.getAttribute("name")))]);
              const visibleFields = await questionnaire.locator("input[name]:not([type='hidden']):visible, textarea[name]:visible").count();
              assert.ok(visibleFields > 0 && visibleFields <= 8, `${brand} questionnaire must keep the initial visible questions short`);
              if (brand === "twin") assert.equal(await questionnaire.locator("details").count(), 0, "Twin account fields have their own page");
              assert.match(await questionnaire.innerText(), brand === "twin" ? /Section 1 of 8/i : /Part 1 of 17/i);
              assert.match(await questionnaire.innerText(), brand === "twin" ? /Autosave on/ : /Changes save automatically/);
              assert.equal(await page.getByRole("button", { name: brand === "twin" ? "Continue" : "Save and continue", exact: true }).count(), 1);
              if (brand === "twin" && width === 390) {
                await questionnaire.locator("input[name='full_name']").fill("Autosaved Creator");
                await questionnaire.getByRole("status").getByText("Saved", { exact: true }).waitFor({ timeout: 5000 });
                const requests = await page.evaluate(() => globalThis.__creatorDraftRequests);
                assert.equal(requests.length, 1, "questionnaire edits must produce one debounced autosave");
                assert.equal(requests[0].section, sectionSlug);
                assert.equal(requests[0].answers.full_name, "Autosaved Creator");
                assert.deepEqual(Object.keys(requests[0].answers).sort(), questionNames.sort(), "autosave must send only the current questionnaire part");
              }
            }
            if (step === "consent") {
              assert.ok(actions.has("/creator-auth/onboarding"), `${brand} consent must retain the onboarding server action`);
              assert.equal(await page.getByRole("heading", { name: "Ready to submit?", exact: true }).count(), 1);
              assert.equal(await page.getByRole("button", { name: "Submit onboarding", exact: true }).isDisabled(), brand !== "twin", `${brand} submission availability must match its optional intake policy`);
            }
            if (step === "content" || step === "voice") assert.ok(actions.has("/creator-auth/upload"), `${brand} ${step} must retain the upload server action`);
            if (step === "content") {
              const contentText = await page.locator("body").innerText();
              if (brand === "twin") {
                assert.match(contentText, /This step is optional/);
                assert.doesNotMatch(contentText, /Upload minimum/);
              } else {
                assert.match(contentText, /Upload minimum 20 SFW images and 30 NSFW images\./);
                assert.match(contentText, /Upload 15 SFW videos and 30 NSFW videos\./);
              }
              assert.doesNotMatch(contentText, /separate from PPV content/i);
              assert.equal(await page.locator("[data-content-category]").count(), 4, `${brand} content must expose four explicit upload categories`);
              const categoryKinds = await page.locator("[data-content-category] input[name='kind']").evaluateAll((inputs) => inputs.map((input) => input.getAttribute("value")));
              assert.deepEqual(categoryKinds, ["content_sfw_image", "content_nsfw_image", "content_sfw_video", "content_nsfw_video"]);
              const acceptedTypes = await page.locator("[data-content-category] input[type='file']").evaluateAll((inputs) => inputs.map((input) => input.getAttribute("accept")));
              assert.deepEqual(acceptedTypes, [
                "image/jpeg,image/png,image/webp,image/gif",
                "image/jpeg,image/png,image/webp,image/gif",
                "application/octet-stream",
                "video/*",
                "application/octet-stream",
                "video/*",
              ]);
              assert.equal(await page.locator("[data-content-category] input[type='file']").evaluateAll((inputs) => inputs.every((input) => input.multiple && !input.disabled)), true, `${brand} draft content pickers must allow multiple files`);
              assert.equal(await page.getByText("Choose videos from Files", { exact: true }).count(), 2, `${brand} video categories must offer the Files bypass`);
              assert.doesNotMatch(`${contentText} ${acceptedTypes.join(" ")}`, /heic|heif/i, `${brand} must not advertise unsupported HEIC uploads`);
              assert.match(contentText, /JPG, PNG, WebP or GIF · max 25 MP and 75 MiB each/);
              assert.match(contentText, /MP4, MOV or WebM · max 512 MiB \(536,870,912 bytes\), 30 minutes and 4K per file; all limits apply together/);
            }
            await page.screenshot({ path: path.join(out, `${brand}-onboarding-${step}-${viewport}.png`), fullPage: true });
          }

          for (const section of ["personal-contact", "appearance", "relationships"]) {
            await page.goto(`${origin}/creator/onboarding?fixture_brand=${brand}&step=questionnaire&section=${section}`, { waitUntil: "networkidle" });
            const targetSection = brand === "twin" ? ({"personal-contact":"quick-about",appearance:"quick-family",relationships:"quick-relationships"}[section]) : section;
            assert.equal(await page.locator(`[data-questionnaire-page='${targetSection}']`).count(), 1, `${brand} must preserve bookmarked questionnaire section ${section}`);
          }

          await page.goto(`${origin}/creator/onboarding?fixture_brand=${brand}&fixture_complete=1`, { waitUntil: "networkidle" });
          assert.equal(await page.getByText("Complete", { exact: true }).count(), 4, `${brand} completed hub must show four visible completion ticks`);
          await page.screenshot({ path: path.join(out, `${brand}-onboarding-complete-${viewport}.png`), fullPage: true });

          await page.goto(`${origin}/creator/onboarding?fixture_brand=${brand}&fixture_complete=1&step=consent`, { waitUntil: "networkidle" });
          assert.equal(await page.getByRole("button", { name: "Submit onboarding", exact: true }).isEnabled(), true, `${brand} complete onboarding must be ready to submit`);

          await page.goto(`${origin}/creator/onboarding?fixture_brand=${brand}&fixture_complete=1&step=questionnaire&status=questionnaire_saved#step-result`, { waitUntil: "networkidle" });
          await page.getByRole("status").getByText("Questionnaire saved", { exact: true }).waitFor();
          assert.equal(await page.locator('form[action="/creator-auth/onboarding"]').count(), 0, `${brand} saved questionnaire must show confirmation instead of jumping back into the form`);
          assert.equal(await page.getByRole("link", { name: "Return to onboarding", exact: true }).count() > 0, true);
          await page.screenshot({ path: path.join(out, `${brand}-onboarding-questionnaire-saved-${viewport}.png`), fullPage: true });

          await page.goto(`${origin}/creator/onboarding?fixture_brand=${brand}`, { waitUntil: "networkidle" });
        }

        assert.deepEqual(runtimeErrors, [], `${brand} ${route} raised browser errors: ${runtimeErrors.join(", ")}`);
        await page.screenshot({ path: path.join(out, `${brand}-${route}-${viewport}.png`), fullPage: true });
        evidence.push({ brand, route, viewport, noOverflow: true, noBrandLeak: true, darkFields: route !== "onboarding", originalParticleCore: brand === "link" });
        await page.close();
      }
    }
  }

  const reduced = await browser.newPage({ viewport: { width: 390, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  await reduced.goto(`${origin}/creator/link/login`, { waitUntil: "networkidle" });
  await reduced.locator('[data-lynq-core="particles"] canvas:visible').waitFor();
  assert.equal(await reduced.locator('[data-login-wash]').evaluate((node) => getComputedStyle(node).animationName), "none",
    "Link background motion must stop under reduced motion");
  const reducedCore = reduced.locator('[data-lynq-core="particles"] canvas:visible');
  const reducedFrame = await reducedCore.evaluate((canvas) => canvas.toDataURL());
  await reduced.waitForTimeout(180);
  assert.equal(await reducedCore.evaluate((canvas) => canvas.toDataURL()), reducedFrame,
    "The original particle core must hold a stable frame under reduced motion");
  assert.equal(await reduced.locator("input").first().evaluate((input) => getComputedStyle(input).transitionDuration), "0s");
  assert.equal(await reduced.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await reduced.screenshot({ path: path.join(out, "link-login-mobile-reduced-motion.png"), fullPage: true });
  await reduced.close();

  writeFileSync(path.join(out, "results.json"), JSON.stringify(evidence, null, 2));
  console.log("CREATOR BRANDING PASSED: Twin, Tether and Link auth/onboarding previews, exact routes, dark autofill-safe fields, original LYNQ particles, reduced motion, and 390px/1440px layouts.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}




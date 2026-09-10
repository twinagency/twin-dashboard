// Renders the real creator auth and onboarding components with local-only
// dependencies. No production account, session, database or network is used.
import assert from "node:assert/strict";
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
assert.match(source("components/CreatorResetPasswordScreen.tsx"), /window\.location\.replace\(["']\/creator-auth\/logout["']\)/,
  "Password recovery must clear the separate HttpOnly creator dashboard session");

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
assert.match(onboardingSource, /data-creator-onboarding-brand=\{tether \? ["']tether["'] : link \? ["']link["'] : ["']twin["']\}/);
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

const kind = location.pathname.split('/').filter(Boolean).at(-1) || 'login';
const brand = location.pathname.includes('/creator/link/') ? 'link' : 'tether';
const params = Object.fromEntries(new URLSearchParams(location.search));
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
  return node;
}
createRoot(document.getElementById('root')).render(<App/>);
`;

const linkMock = `
import React from 'react';
export default function Link({children,href,...props}){return <a {...props} href={String(href)}>{children}</a>}
`;
const headersMock = `export async function cookies(){return {get(){return {value:'local-creator-session'}}}}`;
const navigationMock = `export function redirect(path){throw new Error('Unexpected redirect to '+path)}`;
const identityMock = `
export async function creatorDashboardIdentity(){
  const brand=new URLSearchParams(location.search).get('fixture_brand');
  return {accountId:'11111111-1111-4111-8111-111111111111',userId:'22222222-2222-4222-8222-222222222222',name:brand==='link'?'LYNQ':'Tether',creatorName:'Fixture Creator',cloneIds:[],onboarded:false,agencyId:brand==='link'?'74b03b70-397e-49ab-841f-8adb8241d87d':'fixture-tether'};
}
`;
const databaseMock = `
const rows={
  creator_accounts:{display_name:'Fixture Creator',email:'creator@example.test'},
  creator_onboarding_progress:{questionnaire_completed:false,content_completed:false,voice_completed:false},
  creator_applications:{id:'application-fixture',status:'draft',answers:{}},
  creator_files:[],
  creator_consents:null,
};
function query(table){
  const result=()=>Promise.resolve({data:rows[table]??null,error:null});
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
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{margin:0;font-family:Arial,sans-serif}html{--font-sans:Arial;--font-display:Arial;--font-heading:Arial}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/styles.css") { res.setHeader("content-type", "text/css"); return res.end(styles); }
  if (url.pathname === "/bundle.js") { res.setHeader("content-type", "application/javascript"); return res.end(javascript); }
  res.setHeader("content-type", "text/html");
  return res.end(html);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const expectations = {
  tether: {
    name: "Tether",
    headings: { login: "Sign in to Tether", signup: "Join Tether", "forgot-password": "Reset password", "reset-password": "New password", onboarding: "Build your Tether profile" },
    input: { color: "rgb(8, 10, 14)", background: "rgb(255, 255, 255)", caret: "rgb(8, 10, 14)" },
    authBase: "/creator/tether",
    signupAction: "/creator-auth/tether/signup",
  },
  link: {
    name: "LYNQ",
    headings: { login: "Sign in to LYNQ", signup: "Join LYNQ", "forgot-password": "Reset password", "reset-password": "New password", onboarding: "Build your LYNQ profile" },
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
        const marker = route === "onboarding" ? `[data-creator-onboarding-brand='${brand}']` : `[data-creator-auth-brand='${brand}']`;
        assert.equal(await page.locator(marker).count(), 1, `${brand} ${route} must render its explicit presentation`);
        const visibleText = await page.locator("body").innerText();
        assert.match(visibleText, new RegExp(expectation.name, "i"));
        assert.doesNotMatch(visibleText, /\bTwin\b|Lovable/i, `${brand} ${route} must not visibly leak Twin or Lovable`);
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
            assert.equal(input.color, expectation.input.color, `${brand} ${route} typed text must be dark`);
            assert.equal(input.backgroundColor, expectation.input.background, `${brand} ${route} fields must stay white`);
            assert.equal(input.caretColor, expectation.input.caret, `${brand} ${route} caret must remain visible`);
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
            assert.equal(resetRequest.redirectTo, `${origin}${expectation.authBase}/reset-password`, `${brand} recovery must return to the matching branded reset page`);
          }

          if (brand === "tether") {
            const desktopHero = page.locator("main > div.relative.z-10 > section").first();
            assert.equal(await desktopHero.isVisible(), width >= 1024, `${route} must preserve the Tether desktop hero breakpoint`);
          }
        } else {
          const formActions = new Set(await page.locator("form").evaluateAll((forms) => forms.map((form) => form.getAttribute("action")).filter(Boolean)));
          assert.ok(formActions.has("/creator-auth/onboarding"), `${brand} onboarding must retain its verified server action`);
          assert.ok(formActions.has("/creator-auth/upload"), `${brand} onboarding must retain its upload action`);
          assert.ok(formActions.has("/creator-auth/logout"), `${brand} onboarding must retain creator-only logout`);
          assert.equal(await page.getByRole("link", { name: "Dashboard", exact: true }).getAttribute("href"), "/creator");
        }

        assert.deepEqual(runtimeErrors, [], `${brand} ${route} raised browser errors: ${runtimeErrors.join(", ")}`);
        await page.screenshot({ path: path.join(out, `${brand}-${route}-${viewport}.png`), fullPage: true });
        evidence.push({ brand, route, viewport, noOverflow: true, noTwinLeak: true, darkFields: route !== "onboarding", originalParticleCore: brand === "link" });
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
  console.log("CREATOR BRANDING PASSED: Tether and Link auth, onboarding, exact routes, dark autofill-safe fields, original LYNQ particles, reduced motion, and 390px/1440px layouts.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

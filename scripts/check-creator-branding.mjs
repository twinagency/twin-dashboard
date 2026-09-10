// Renders the real creator auth and onboarding components with local-only
// dependencies. No production account, session, database or network is used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
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

const wrappers = new Map([
  ["app/creator/login/page.tsx", ["CreatorLoginScreen", "twin"]],
  ["app/creator/signup/page.tsx", ["CreatorSignupScreen", "twin"]],
  ["app/creator/forgot-password/page.tsx", ["CreatorForgotPasswordScreen", "twin"]],
  ["app/creator/reset-password/page.tsx", ["CreatorResetPasswordScreen", "twin"]],
  ["app/creator/tether/login/page.tsx", ["CreatorLoginScreen", "tether"]],
  ["app/creator/tether/signup/page.tsx", ["CreatorSignupScreen", "tether"]],
  ["app/creator/tether/forgot-password/page.tsx", ["CreatorForgotPasswordScreen", "tether"]],
  ["app/creator/tether/reset-password/page.tsx", ["CreatorResetPasswordScreen", "tether"]],
]);
for (const [file, [component, brand]] of wrappers) {
  assert.match(source(file), new RegExp(`<${component}[^>]*brand=["']${brand}["']`), `${file} must select ${brand} explicitly`);
}

const layoutSource = source("app/layout.tsx");
assert.match(layoutSource, /creatorPublicPortal\(pathname\) === "tether" \|\| creator\?\.name === TETHER_PORTAL\.name/,
  "Creator metadata must recognize both public and verified-session Tether routes");
assert.match(layoutSource, /tether \? "\/tether\/icon\.svg" : "\/icon\.png"/,
  "Tether creator metadata must use the Tether favicon");
assert.match(layoutSource, /tether \? "image\/svg\+xml" : "image\/png"/,
  "Tether favicon must declare its SVG media type");

const onboardingSource = source("app/creator/onboarding/page.tsx");
assert.doesNotMatch(onboardingSource, /Twin\/Lovable|Lovable/,
  "Creator onboarding must not expose the implementation platform");
assert.match(onboardingSource, /data-creator-onboarding-brand=\{tether \? "tether" : "twin"\}/);
assert.doesNotMatch(onboardingSource, /export const metadata\s*=/,
  "Onboarding must inherit verified-session creator metadata from the root layout");

const iconPath = path.join(root, "public/tether/icon.svg");
assert.equal(existsSync(iconPath), true, "Tether favicon is missing");
const iconSource = readFileSync(iconPath, "utf8");
assert.match(iconSource, /<svg\b/);
assert.doesNotMatch(iconSource, /Twin/i);

const fixture = `
import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import Login from './components/CreatorLoginScreen';
import Signup from './components/CreatorSignupScreen';
import Forgot from './components/CreatorForgotPasswordScreen';
import Reset from './components/CreatorResetPasswordScreen';
import Onboarding from './app/creator/onboarding/page';

const kind = location.pathname.split('/').filter(Boolean).at(-1) || 'login';
function App(){
  const [node,setNode]=useState(null);
  useEffect(()=>{
    let active=true;
    (async()=>{
      const rendered=kind==='login'
        ? await Login({searchParams:Promise.resolve({}),brand:'tether'})
        : kind==='signup'
          ? await Signup({searchParams:Promise.resolve({}),brand:'tether'})
          : kind==='onboarding'
            ? await Onboarding({searchParams:Promise.resolve({})})
            : null;
      if(active&&rendered)setNode(rendered);
    })();
    return()=>{active=false};
  },[]);
  if(kind==='forgot-password')return <Forgot brand="tether"/>;
  if(kind==='reset-password')return <Reset brand="tether"/>;
  return node;
}
createRoot(document.getElementById('root')).render(<App/>);
`;

const linkMock = `
import React from 'react';
export default function Link({children,href,...props}){return <a {...props} href={String(href)}>{children}</a>}
`;
const headersMock = `export async function cookies(){return {get(){return {value:'local-tether-session'}}}}`;
const navigationMock = `export function redirect(path){throw new Error('Unexpected redirect to '+path)}`;
const identityMock = `
export async function creatorDashboardIdentity(){return {accountId:'11111111-1111-4111-8111-111111111111',name:'Tether',creatorName:'Fixture Creator',cloneIds:[],onboarded:false}}
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
  resetPasswordForEmail:async()=>({error:null}),
  getSession:async()=>({data:{session:null}}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
  updateUser:async()=>({error:null}),
  signOut:async()=>({error:null}),
}}}
`;

const bundle = await build({
  stdin: { contents: fixture, resolveDir: root, sourcefile: "creator-branding-fixture.tsx", loader: "tsx" },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
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
        builder.onResolve({ filter: new RegExp(`^${specifier.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`) }, () => ({ path: specifier, namespace: "branding-mock" }));
        builder.onLoad({ filter: /.*/, namespace: "branding-mock" }, (args) => {
          const value = mocks.get(args.path);
          return value ? { contents: value[0], loader: value[1], resolveDir: root } : null;
        });
      }
      builder.onResolve({ filter: /^@\// }, (args) => ({ path: resolveLocalModule(args.path) }));
    },
  }],
});

const css = await postcss([tailwind()]).process('@import "./app/globals.css";\n@import "./app/creator-workspace.css";', {
  from: path.join(root, "creator-branding-verification.css"),
});
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{margin:0;font-family:Arial,sans-serif}html{--font-sans:Arial;--font-display:Arial;--font-heading:Arial}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/styles.css") { res.setHeader("content-type", "text/css"); return res.end(css.css); }
  if (url.pathname === "/bundle.js") { res.setHeader("content-type", "application/javascript"); return res.end(bundle.outputFiles[0].text); }
  res.setHeader("content-type", "text/html");
  return res.end(html);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const expected = {
  login: "Sign in to Tether",
  signup: "Join Tether",
  "forgot-password": "Reset password",
  "reset-password": "New password",
  onboarding: "Build your Tether profile",
};

try {
  for (const [route, heading] of Object.entries(expected)) {
    for (const width of [390, 1440]) {
      const viewport = width < 1024 ? "mobile" : "desktop";
      const page = await browser.newPage({ viewport: { width, height: 1000 }, colorScheme: "light" });
      const runtimeErrors = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      await page.goto(`${origin}/${route}`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      const marker = route === "onboarding" ? "[data-creator-onboarding-brand='tether']" : "[data-creator-auth-brand='tether']";
      assert.equal(await page.locator(marker).count(), 1, `${route} must render the Tether presentation`);
      const visibleText = await page.locator("body").innerText();
      assert.match(visibleText, /Tether/);
      assert.doesNotMatch(visibleText, /\bTwin\b|Lovable/i, `${route} must not visibly leak Twin or Lovable`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} must not overflow at ${width}px`);
      if (route !== "onboarding") {
        for (const href of await page.locator("a").evaluateAll((links) => links.map((link) => link.getAttribute("href")).filter(Boolean))) {
          assert.match(href, /^\/creator\/tether\//, `${route} contains a non-Tether creator link: ${href}`);
        }
        for (const styles of await page.locator("input:not([type='hidden'])").evaluateAll((inputs) => inputs.map((input) => {
          const computed = getComputedStyle(input);
          return {
            className: input.className,
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            caretColor: computed.caretColor,
          };
        }))) {
          assert.match(styles.className, /\btether-auth-input\b/, `${route} has an auth input outside the shared Tether treatment`);
          assert.equal(styles.color, "rgb(8, 10, 14)", `${route} typed text must be near-black`);
          assert.equal(styles.backgroundColor, "rgb(255, 255, 255)", `${route} inputs must retain a white background`);
          assert.equal(styles.caretColor, "rgb(8, 10, 14)", `${route} input caret must remain visible`);
        }
        const desktopHero = page.locator("main > div.relative.z-10 > section").first();
        assert.equal(await desktopHero.isVisible(), width >= 1024, `${route} must switch hero layout at the desktop breakpoint`);
      }
      assert.deepEqual(runtimeErrors, [], `${route} raised browser errors: ${runtimeErrors.join(", ")}`);
      await page.screenshot({ path: path.join(out, `tether-${route}-${viewport}.png`), fullPage: true });
      await page.close();
    }
  }
  console.log("CREATOR BRANDING PASSED: explicit brand contracts, verified-session Tether metadata/favicon, no visible Twin/Lovable leakage, and real auth/onboarding components at 390px and 1440px.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

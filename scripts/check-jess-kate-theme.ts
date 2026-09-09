import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("app/jess-kate-theme.css");
const layout = read("app/layout.tsx");
const core = read("components/IntelligenceCoreIcon.tsx");
const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
const scope = 'html[data-brand-theme="ivory-cherry"]';
const rules = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
assert.ok(rules.length > 10, "Theme stylesheet must contain its shell overrides");
for (const [, selectorText, declarations] of rules) {
  // :is(a, button) contains a comma but remains part of one scoped selector.
  const selectors = selectorText.replace(/:is\([^)]*\)/g, ":is(*)").split(",");
  for (const selector of selectors) {
    assert.ok(selector.trim().startsWith(scope), `Unscoped theme rule: ${selector}`);
  }
  assert.doesNotMatch(declarations, /(?:^|;)\s*(?:width|height|display|position|padding|margin|font-family|font-size)\s*:/m,
    "The colour theme must not change layout or typography");
}

assert.ok(layout.indexOf('import "./jess-kate-theme.css"') > layout.indexOf('import "./globals.css"'),
  "Partner stylesheet must be imported after the shared palette");
assert.equal((layout.match(/data-brand-theme=\{/g) ?? []).length, 2,
  "Theme is attached to the login and verified dashboard root only");
assert.ok(layout.includes('data-brand-theme={agency?.name === JESS_KATE_PORTAL.name ? "ivory-cherry" : undefined}'),
  "Authenticated branding must come from the verified agency, not the current route");
assert.ok(layout.includes('pathAgencyName(pathname) === JESS_KATE_PORTAL.name ? "ivory-cherry" : undefined'),
  "The Jess and Kate login must receive the same theme");
assert.ok(layout.includes('data-agency={isMoxy(agency?.name) ? "moxy" : undefined}'),
  "Moxy branding must remain intact");

for (const [token, value] of Object.entries({
  "--color-bg": "#f7f2ec",
  "--color-accent": "#7a1734",
  "--jess-kate-blush": "#ebcbd2",
  "--color-ink": "#211c1e",
})) assert.ok(clean.includes(`${token}: ${value};`), `Incorrect approved palette token: ${token}`);

assert.doesNotMatch(clean, /--(?:color-(?:good|grass(?:-light)?|warn|crit|info)|earnings-green|chart-\d+)\s*:/,
  "Money, status and chart meaning must not be redefined by branding");
assert.doesNotMatch(clean, /(?:^|[;{])\s*filter\s*:/m,
  "No recolouring filters: preserve emoji, Stars, images and privacy rendering");
assert.doesNotMatch(clean, /\.tg-(?:thread|bubble)|\.recharts-(?:bar|line)-|\b(?:img|video|svg)\s*\{/,
  "Do not recolour message previews, chart series or media with blanket selectors");
assert.ok(clean.includes('.dashboard-topbar .tabular-nums {\n  color: var(--color-good);'),
  "The cash balance in the top bar must stay green");
for (const fallback of ["56,189,248", "45,190,255", "238,252,255", "103,232,249"])
  assert.ok(core.includes(`"${fallback}"`), "Other partners must retain their original particle colours");

function luminance(hex: string) {
  const channels = hex.replace("#", "").match(/../g)!.map(value => {
    const s = parseInt(value, 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
for (const [foreground, background] of [
  ["#211c1e", "#f7f2ec"], ["#74676b", "#f7f2ec"],
  ["#74676b", "#fffcf9"], ["#ffffff", "#7a1734"],
  ["#461323", "#ebcbd2"],
]) assert.ok(contrast(foreground, background) >= 4.5,
  `Insufficient UI text contrast: ${foreground} on ${background}`);

console.log("Jess and Kate theme: tenant isolation, login/dashboard coverage, semantic colours, unchanged geometry and text contrast passed.");

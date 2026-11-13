/**
 * KNOWN RED (W4 F14, docs/review/W4/api-ai-assistant-plus2.md): app/api/ai-assistant/nav-tools.ts NAV_TARGETS says
 * "/" is "Overview, the fleet-wide home dashboard", but app/page.tsx re-exports the login page; and CLONE_TABS
 * offers "paywall"/"onboarding", which components/CloneForm.tsx does not have (resolveTab falls back to Identity)
 * while the tool still answers ok:true, opened "...?tab=paywall".
 * Static read of the page sources (the assistant's claims are checked against what the routes render).
 * Control: "/revenue" resolves and is a real page; "identity" is a clone tab CloneForm knows.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/known-red/W4-api-ai-assistant-plus2-nav-targets.test.ts
 * DECLARED BYPASS: none (no network, no server action; harness imported only for the shared preamble).
 */
import "./G18-harness";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const pageSource = (path: string) => {
  const f = new URL(`app${path === "/" ? "" : path}/page.tsx`, root);
  return existsSync(f) ? readFileSync(f, "utf8") : null;
};
const isLoginReexport = (src: string) => /export\s*\{[^}]*\bdefault\b[^}]*\}\s*from\s*["'](\.\/|@\/app\/)login\/page["']/.test(src);

function cloneFormTabs(): string[] {
  const src = readFileSync(new URL("components/CloneForm.tsx", root), "utf8");
  const all = src.match(/const ALL_TABS: Tab\[\] = \[([^\]]*)\]/)?.[1] ?? "";
  const legacy = src.match(/const LEGACY_TAB: Record<string, Tab> = \{([^}]*)\}/)?.[1] ?? "";
  return [...all.matchAll(/"([a-z_-]+)"/g), ...legacy.matchAll(/^\s*([a-z_-]+)\s*:/gm)].map((m) => m[1]);
}

test("control: openPage /revenue resolves to a real (non-login) page and identity is a clone tab", async () => {
  const { resolveNavTool } = await import("../../app/api/ai-assistant/nav-tools");
  assert.deepEqual(resolveNavTool("openPage", { page: "/revenue" }), { path: "/revenue", label: "Earnings" });
  const src = pageSource("/revenue");
  assert.ok(src && !isLoginReexport(src));
  assert.ok(cloneFormTabs().includes("identity"), "CloneForm tab list must parse");
  assert.ok(isLoginReexport('export { default, metadata } from "./login/page";'), "login re-export detector works");
});

test("F14: no nav target the assistant can open is the login page", async () => {
  const { NAV_TARGETS } = await import("../../app/api/ai-assistant/nav-tools");
  const login = NAV_TARGETS.filter((t) => { const s = pageSource(t.path); return s !== null && isLoginReexport(s); });
  assert.deepEqual(login.map((t) => `${t.path} (${t.label})`), []);
});

test("F14: every clone tab the assistant can open is a tab the clone page has", async () => {
  const { CLONE_TABS } = await import("../../app/api/ai-assistant/nav-tools");
  const known = cloneFormTabs();
  assert.deepEqual(CLONE_TABS.filter((t) => !known.includes(t)), []);
});

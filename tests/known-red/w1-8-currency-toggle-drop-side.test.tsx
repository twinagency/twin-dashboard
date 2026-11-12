// KNOWN RED (W1 lane 8 P10, DROP SIDE ONLY; REVIEW.md Structure "UI"; reverts main's #346).
// MOOT UNDER D1 (replay, not merge): the replay keeps #346's CurrencyToggle, so this only matters if the drop-side file is merged.
// Drop-side components/CurrencyToggle.tsx: the compact button lost its aria-label (accessible name is now "$AUD"), and the non-compact
// buttons render a literal "$AUD"/"$USD" (JSX `${c}` outside a template literal) instead of the code.
// Fixed looks like: compact button has an accessible name (aria-labelledby, aria-label or content) naming the next currency; each non-compact button's text is
// exactly the currency code. Copy beyond the code is not pinned.
// Not wired into npm scripts; init.sh does not run it yet. Offline: SSR (react-dom/server), CurrencyProvider's effect (localStorage,
// /api/fx) never runs in SSR, so no fetch at all.
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/w1-8-currency-toggle-drop-side.test.tsx   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/w1-8-currency-toggle-drop-side.test.tsx   (red, ERR_ASSERTION)
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import CurrencyProvider from "../../components/CurrencyProvider";
import CurrencyToggle from "../../components/CurrencyToggle";

Object.assign(globalThis, { React }); // the components use the classic JSX transform under tsx
const render = (compact: boolean) => renderToString(React.createElement(CurrencyProvider, null, React.createElement(CurrencyToggle, { compact })));
const text = (markup: string) => markup.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "").trim();
const buttons = (markup: string) => [...markup.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(m => ({ attrs: m[1], text: text(m[2]) }));

test("control: compact toggle renders one button showing the current currency (AUD default)", () => {
  const all = buttons(render(true));
  assert.equal(all.length, 1);
  assert.match(all[0].text, /AUD/);
});

test("P10 A: compact button has an accessible name naming the switch to the next currency", () => {
  // Accessible name, simplified accname order: aria-labelledby (resolved in the same markup) > aria-label > content text.
  // Any of them naming the next currency fixes it (codex final: don't pin aria-label).
  const markup = render(true);
  const [compact] = buttons(markup);
  const ids = /aria-labelledby="([^"]*)"/.exec(compact.attrs)?.[1]?.split(/\s+/) ?? [];
  const byIds = ids.map(id => text(new RegExp(`id="${id}"[^>]*>(.*?)</`).exec(markup)?.[1] ?? "")).join(" ").trim();
  const name = byIds || /aria-label="([^"]*)"/.exec(compact.attrs)?.[1] || compact.text;
  assert.match(name, /USD/, `compact button's accessible name "${name}" does not name the switch to USD`);
});

test("P10 B: non-compact buttons show exactly the currency code", () => {
  assert.deepEqual(buttons(render(false)).map(b => b.text), ["AUD", "USD"]);
});

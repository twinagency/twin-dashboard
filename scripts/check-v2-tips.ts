// V2 Stage 4 (conversational tips) on the dashboard. Offline: no database, nothing posted.
//  1. Settings: a clone with engine 'v2' sees the tip credits rate labelled legacy-V1-only (the field stays, so a save cannot reset it),
//     the Tips hint no longer promises credits, an empty amount list stays empty and says the bot asks the fan. A live clone is unchanged.
//  2. Revenue: V2 tip charges (kind 'tip', feature 'tip', payload v2tip:<quote>) are counted as tips, not credits / media / other,
//     are paid orders (not adjustments), survive the double-payment dedupe, and a refund of one is still a refund. Legacy rows unchanged.
import { readFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normFeature, normKind } from "../lib/analytics-data";
import { classifyRevenueLedgerRow } from "../lib/revenue-ledger";
import { dedupeStarRows } from "../lib/star-dedupe";
import { isV2Engine, V2_SPOIL_HINT, V2_TIP_CREDITS_HINT_PREFIX, V2_TIP_CREDITS_LABEL, V2_TIPS_SECTION_HINT } from "../lib/v2-tips";
import type { CloneConfigState } from "../components/clone/useCloneConfig";
import type { Clone } from "../lib/types";

let fails = 0, n = 0;
const check = (name: string, c: boolean, detail = "") => { n++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`); if (!c) fails++; };
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// ── 1. settings ──────────────────────────────────────────────────────────────
async function main() {
// The component files use the classic JSX transform under tsx, which needs React in scope.
(globalThis as { React?: unknown }).React = React;
// ConfigSections now imports CSS modules (creator studio layout): stub them for this server-side render, like check-creator-studio does.
{
  const { register, createRequire } = await import("node:module");
  const cssStub = "export default new Proxy({}, { get: (_, k) => String(k) });";
  register("data:text/javascript," + encodeURIComponent(`export async function load(url, ctx, next) { if (url.endsWith(".module.css")) return { format: "module", shortCircuit: true, source: ${JSON.stringify(cssStub)} }; return next(url, ctx); }`));
  const ext = (createRequire(import.meta.url)("module") as any)._extensions;
  ext[".css"] = (m: any) => { m.exports = new Proxy({}, { get: (_: unknown, k: string | symbol) => (k === "__esModule" ? true : k === "default" ? m.exports : String(k)) }); };
}
const { MonetizationSections } = await import("../components/clone/ConfigSections");
const { useCloneConfig } = await import("../components/clone/useCloneConfig");
const { DEFAULT_SPOIL_OPTIONS } = await import("../components/clone/fields");
check("only engine 'v2' counts as V2 (live, null, missing, other values do not)", isV2Engine({ engine: "v2" }) && !isV2Engine({ engine: "live" }) && !isV2Engine({ engine: null }) && !isV2Engine({}) && !isV2Engine(undefined) && !isV2Engine({ engine: "V2 " }));
check("the label says what the operator asked for", V2_TIP_CREDITS_LABEL.includes("legacy V1 tips only, V2 tips give no reply credits"));
check("no em dashes in the new copy (repo UI rule)", ![V2_TIPS_SECTION_HINT, V2_TIP_CREDITS_LABEL, V2_TIP_CREDITS_HINT_PREFIX, V2_SPOIL_HINT].some((t) => /[—–]/.test(t)));
check("empty-list hint says the bot asks the fan how many Stars and invents no presets", /empty list means the bot asks the fan how many Stars/.test(V2_SPOIL_HINT) && /No preset amounts are invented/.test(V2_SPOIL_HINT));
check("V2 Tips hint promises no credits", /no message credits/.test(V2_TIPS_SECTION_HINT) && !/give him message credits back/.test(V2_TIPS_SECTION_HINT));

const base = { id: "c1", slug: "x", name: "X", tips_enabled: true, tip_credits_per_100_stars: 5, spoil_options: null } as unknown as Partial<Clone>;
const render = (clone: Partial<Clone>) => {
  let state!: CloneConfigState;
  const Page = () => {
    const [cfg, set] = useCloneConfig(clone);
    state = cfg;
    return createElement(MonetizationSections, { cfg, set, clone });
  };
  return { html: renderToStaticMarkup(createElement(Page)), state };
};
const v2 = render({ ...base, engine: "v2" });
const live = render({ ...base, engine: "live" });
const noEngine = render({ ...base });
const creditsInput = (h: string) => /<input[^>]*name="tip_credits_per_100_stars"[^>]*>/.exec(h)?.[0] ?? "";

check("V2 clone: credits field is labelled legacy V1 only", v2.html.includes(V2_TIP_CREDITS_LABEL));
check("V2 clone: the field is still rendered and posts its saved value (hiding it would reset the rate to 0 on save)", /value="5"/.test(creditsInput(v2.html)) && !/disabled/.test(creditsInput(v2.html)));
check("live clone: original label, no legacy wording", live.html.includes("Credits per 100 stars tipped") && !live.html.includes("legacy V1 tips only"));
check("clone with no engine column yet behaves as live", noEngine.html === live.html && !noEngine.state.engineV2);
check("V2 clone, no spoil_options saved: the amount list is empty, not the V1 default menu", v2.state.engineV2 && v2.state.spoilOptions.length === 0);
check("live clone, no spoil_options saved: the V1 default menu (unchanged)", live.state.spoilOptions.length === DEFAULT_SPOIL_OPTIONS.length && live.state.spoilOptions.length > 0);
check("V2 clone with a saved list shows exactly that list", render({ ...base, engine: "v2", spoil_options: [{ stars: 250, label: "" }] }).state.spoilOptions[0]?.stars === 250);
check("V2 amount editor carries the empty-list label; a live clone's editor does not", v2.html.includes("Tip amount choices") && !live.html.includes("Tip amount choices"));
check("V2 empty list posts an empty list (bot asks the fan)", /name="spoil_options"[^>]*value="\[\]"|value="\[\]"[^>]*name="spoil_options"/.test(v2.html));
check("live clone posts the default menu as before", live.html.includes(`&quot;stars&quot;:${DEFAULT_SPOIL_OPTIONS[0].stars}`));

const sections = src("components/clone/ConfigSections.tsx");
check("hints are wired to the engine flag (hover text is not in static markup, so the source is asserted)", /cfg\.engineV2 \? V2_TIPS_SECTION_HINT/.test(sections) && /cfg\.engineV2 \? V2_TIP_CREDITS_HINT_PREFIX/.test(sections) && /cfg\.engineV2 && <FieldLabel/.test(src("components/clone/editors.tsx")));

// ── 2. revenue ───────────────────────────────────────────────────────────────
const Q = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const v2tip = { id: "tx1", clone_id: "c1", telegram_id: 7, kind: "tip", feature: "tip", amount_stars: 250, paid_at: "2026-10-11T01:00:00Z", invoice_payload: `v2tip:${Q}` };
check("V2 tip: coarse kind is tip (not credits, media or other)", normKind(v2tip.kind) === "tip");
check("V2 tip: feature is tip", normFeature(v2tip.feature, v2tip.kind) === "tip");
check("V2 tip written before the feature column existed still lands in tips", normFeature(null, "tip") === "tip");
check("an upper-case payload does not matter (buckets never read the payload)", normKind("tip") === "tip" && classifyRevenueLedgerRow({ ...v2tip, invoice_payload: `V2TIP:${Q}` }).paidOrder);
const cl = classifyRevenueLedgerRow(v2tip);
check("V2 tip is a paid order worth its Stars, not an adjustment", cl.paidOrder && !cl.adjustment && cl.stars === 250);
const refund = classifyRevenueLedgerRow({ ...v2tip, id: "tx2", amount_stars: -250, invoice_payload: "refund" });
check("a refund of a V2 tip is still an adjustment, never an order", refund.adjustment && !refund.paidOrder && refund.stars === -250);
check("two V2 tips of a different amount are both kept; a double-recorded identical charge collapses once", dedupeStarRows([v2tip, { ...v2tip, id: "tx3", amount_stars: 500, invoice_payload: `v2tip:${Q.replace("0a", "0b")}` }]).length === 2 && dedupeStarRows([v2tip, { ...v2tip, id: "tx4" }]).length === 1);
check("legacy rows unchanged: tip_ / spoil_ payloads, a credit pack, a photo and an untagged row", normKind("tip") === "tip" && normFeature("tip", "tip") === "tip" && normKind("credits") === "credits" && normFeature("credits", "credits") === "credits" && normKind("media") === "media" && normFeature("photo", "media") === "photo" && normKind("weird") === "other" && normFeature(null, "weird") === "other");
check("a V2 tip is never mistaken for credits or media", normFeature(v2tip.feature, v2tip.kind) !== "credits" && normKind(v2tip.kind) !== "media");

const analytics = src("lib/analytics-data.ts"), dash = src("lib/dashboard-data.ts"), ledger = src("lib/revenue-ledger.ts");
check("no revenue view classifies on an invoice payload prefix (tip_ / spoil_ / v2tip), so nothing needs extending for the reserved namespace", ![analytics, dash, ledger, src("lib/star-dedupe.ts")].some((s) => /invoice_payload[^\n]*\.(startsWith|includes|match)\(|(startsWith|includes)\(["'`](tip_|spoil_|v2tip)/.test(s)));
check("Recent sales labels a tip by its feature/kind, and only media rows enter the chat-history offer matching", /kind: p\.adjustment \? "refund" : mediaType \|\| p\.feature \|\| p\.kind/.test(dash) && /p\.paidOrder && \(p\.kind === "media" \|\| isMediaType\(p\.feature\)\)/.test(dash));

}
main().then(() => {
console.log(fails ? `\n${fails} FAILED of ${n}` : `\nall ${n} V2 tips checks passed`);
process.exit(fails ? 1 : 0);
});

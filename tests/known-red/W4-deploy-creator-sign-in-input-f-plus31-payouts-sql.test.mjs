// KNOWN RED (W4 F1, F2, F3; docs/review/W4/deploy-creator-sign-in-input-f-plus31.md): the manual payout
// ledger DDL deployment/telegram-creator-payouts.sql overstates earnings (no duplicate collapse), accepts
// an anonymous void, and leaves service_role able to TRUNCATE the "undeletable" history.
// Owner = team's Claude. Not wired into npm scripts; init.sh does not run it yet (orchestrator wires it at
// window close). SQL/TS text parse only; nothing is applied.
// Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/known-red/W4-deploy-creator-sign-in-input-f-plus31-payouts-sql.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { readTarget, requireTarget } from "../support/w4-deploy-vm.mjs";

const SQL_PATH = "deployment/telegram-creator-payouts.sql";
const FINDINGS = "F1, F2, F3";
const KEYS = ["clone_id", "telegram_id", "kind", "amount_stars", "paid_at"];
const sqlText = () => requireTarget(SQL_PATH, FINDINGS).toLowerCase();

/** Body of a `create ... function public.<name>(` as dollar-quoted text, or null when it is gone. */
function functionBody(sql, name) {
  const at = sql.indexOf(`function public.${name}(`);
  if (at < 0) return null;
  const open = sql.indexOf("$$", at);
  const close = sql.indexOf("$$", open + 2);
  return open > at && close > open ? sql.slice(open + 2, close) : null;
}

/** Each select arm of `text` (subqueries, CTE bodies and union arms each their own entry), with nested
 * subqueries blanked out of the arm that contains them, so a clause is judged against its own select. */
function selectArms(text) {
  const arms = [];
  const flatten = (s) => {
    let out = "";
    for (let i = 0; i < s.length;) {
      if (s[i] !== "(") { out += s[i++]; continue; }
      let depth = 1, j = i + 1;
      for (; j < s.length && depth; j++) depth += s[j] === "(" ? 1 : s[j] === ")" ? -1 : 0;
      const inner = s.slice(i + 1, j - 1);
      if (/^\s*(?:select|with)\b/.test(inner)) { pushArms(flatten(inner)); out += "(subquery)"; } else out += `(${flatten(inner)})`;
      i = j;
    }
    return out;
  };
  const pushArms = (flat) => { for (const arm of flat.split(/\bunion\b(?:\s+all)?|\bintersect\b|\bexcept\b/)) if (/\bselect\b/.test(arm)) arms.push(arm); };
  pushArms(flatten(text));
  return arms;
}
const hasKeys = (list) => KEYS.every((k) => new RegExp(`\\b${k}\\b`).test(list ?? ""));
const SUMS_STARS = /\bsum\s*\((?:[^()]|\([^()]*\))*\bamount_stars\b/;
// A positive selection of refund rows (as opposed to `<> 'refund'` / `not ... refund` / `amount_stars > 0`).
const PICKS_REFUND = /(?<![<>!])=\s*'refund'|\bin\s*\([^)]*'refund'|\bamount_stars\s*<=?\s*0\b/;
const DROPS_REFUND = /(?:<>|!=)\s*'refund'|\bnot\b[^,;]{0,60}'refund'|\bamount_stars\s*>=?\s*0\b/;

/** Static read of the SQL fix: which select dedupes, which sums, and whether refunds are kept. */
function sqlDedupe(body) {
  const arms = selectArms(body);
  const facts = arms.map((arm) => {
    const groupBy = arm.match(/\bgroup\s+by\b([\s\S]*?)(?=\bhaving\b|\border\s+by\b|\blimit\b|\bwindow\b|$)/)?.[1];
    const sums = SUMS_STARS.test(arm);
    const distinctOn = arm.match(/\bselect\s+distinct\s+on\s*\(([^)]*)\)/)?.[1];
    const distinct = arm.match(/\bselect\s+distinct\b(?!\s+on\b)([\s\S]*?)\bfrom\b/)?.[1];
    const partition = arm.match(/\brow_number\s*\(\s*\)\s*over\s*\(\s*partition\s+by\b([^)]*)\)/)?.[1];
    // A 5-key group by only dedupes when that same select does not sum amount_stars (a sum inside the
    // business-key group adds the duplicates back up).
    const dedupes = (hasKeys(groupBy) && !sums) || hasKeys(distinctOn) || hasKeys(distinct) || hasKeys(partition);
    return { dedupes, sumsOutside: sums && !hasKeys(groupBy), picksRefund: PICKS_REFUND.test(arm) };
  });
  const dedupeAt = facts.findIndex((f) => f.dedupes);
  const sumAt = facts.findIndex((f, i) => f.sumsOutside && i !== dedupeAt);
  // Refunds are kept when a union arm selects them, a case expression routes them, or an `or` exempts them
  // from the dedupe filter (e.g. `rn = 1 or invoice_payload = 'refund'`). A filter that only drops them is not.
  const kept = (arms.length > 1 && facts.some((f) => f.picksRefund) && /\bunion\b/.test(body)) ||
    new RegExp(`\\bcase\\s+when\\b[^;]*?(?:${PICKS_REFUND.source})`).test(body) ||
    new RegExp(`\\bor\\b\\s*[^;,]{0,80}?(?:${PICKS_REFUND.source})`).test(body);
  return {
    ok: dedupeAt >= 0 && sumAt >= 0 && kept,
    why: `dedupe=${dedupeAt >= 0} sumOverDeduped=${sumAt >= 0} refundsKept=${kept} refundsDropped=${DROPS_REFUND.test(body) && !kept}`,
  };
}

test("control: ledger has RLS on, anon/authenticated revoked, immutability trigger before update or delete", () => {
  const sql = sqlText();
  assert.match(sql, /alter table public\.telegram_creator_payouts enable row level security/);
  assert.match(sql, /revoke [^;]*on (?:table )?public\.telegram_creator_payouts from [^;]*\banon\b[^;]*\bauthenticated\b/);
  assert.match(sql, /before update or delete on public\.telegram_creator_payouts\s+for each row/);
});

test("F2: void branch of the table CHECK rejects a void with NULL voided_by / void_reason", () => {
  // length(NULL) between 1 and 200 is NULL, and a CHECK that evaluates to NULL passes.
  const sql = sqlText();
  const start = sql.indexOf("check ((voided_at is null");
  assert.ok(start >= 0, "void CHECK must exist");
  const check = sql.slice(start, sql.indexOf(");", start));
  const branch2 = check.slice(check.indexOf("voided_at is not null"));
  const nullSafe = (col) =>
    new RegExp(`\\b${col} is not null`).test(branch2) ||
    new RegExp(`coalesce\\([^;]*\\b${col}\\b[^;]*,\\s*false\\)`).test(branch2) ||
    new RegExp(`length\\(\\s*(?:trim\\(\\s*)?coalesce\\(\\s*${col}\\b`).test(branch2);
  assert.ok(nullSafe("voided_by") && nullSafe("void_reason"), `void branch lets NULL voided_by/void_reason through: ${branch2.replace(/\s+/g, " ")}`);
});

test("F1: payout earnings are deduplicated on the star payment business key", () => {
  // lib/star-dedupe.ts header: a 2026-09 bot bug wrote some Telegram payments twice (169 duplicate rows,
  // ~110k Stars) under different ids but the same (clone_id, telegram_id, kind, amount_stars, paid_at);
  // every SUM over star_transactions, agency earnings included, must count each business key once.
  // A raw sum turns those duplicates into owed money on the payout page.
  // Fixed either (a) in TS: lib/payouts/server.ts calls dedupeStarRows and stops using the raw-sum rpc, or
  // (b) in SQL: one select dedupes on the business key (distinct / distinct on / row_number partition / a
  // 5-key group by that does not itself sum amount_stars), another sums over it, and refunds are kept.
  const sql = sqlText();
  const server = readTarget("lib/payouts/server.ts") ?? "";
  const code = server.replace(/^\s*import\b[^;]*;/gm, "");
  const tsFixed = /import\s*\{[^}]*\bdedupeStarRows\b[^}]*\}\s*from\s*["'][^"']*star-dedupe["']/.test(server) &&
    /\bdedupeStarRows\s*\(/.test(code) && !/rpc\(\s*["']telegram_payout_earnings["']/.test(server);
  const body = functionBody(sql, "telegram_payout_earnings");
  const verdict = body === null ? { ok: false, why: "function absent" } : sqlDedupe(body);
  assert.ok(tsFixed || verdict.ok,
    `earnings sum raw star_transactions (ts path: dedupeStarRows not called; sql: ${verdict.why}). Static check; confirm numbers with LIVE-CHECK`);
});

test("F3: payout history cannot be removed by service_role (service_role revoked, or a before truncate trigger)", () => {
  const sql = sqlText();
  const serviceRevoked = /revoke\s+(?:all|[^;]*\btruncate\b)[^;]*\bon\s+(?:table\s+)?public\.telegram_creator_payouts\s+from\s+[^;]*\bservice_role\b/.test(sql);
  const truncateTrigger = /before\s+truncate\s+on\s+public\.telegram_creator_payouts/.test(sql);
  assert.ok(serviceRevoked || truncateTrigger,
    "service_role keeps default ALL (incl. TRUNCATE) on the ledger and no before truncate trigger exists");
});

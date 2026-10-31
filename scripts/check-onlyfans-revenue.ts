// Per-creator OnlyFans revenue rollup and the Revenue nav entry. Pure, offline.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rollUpCreators, loadOnlyFansRevenue } from "../lib/onlyfans/revenue";
import { ONLYFANS_CHANNEL } from "../lib/channel-nav";
import type { OfAccount } from "../lib/onlyfans-preview/types";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + detail}`); if (!ok) failed++; };
const acct = (accountId: string, creatorId: string, creatorName: string, handle: string) => ({ accountId, binding: { creatorId, creatorName, handle } }) as unknown as OfAccount;
const row = (id: string, paymentCount: number, grossCents: number, netCents: number | null) => ({ id, paymentCount, grossCents, netCents });

const accounts = [acct("a1", "c1", "Naomi", "naomi"), acct("a2", "c2", "Maile", "maile"), acct("a3", "c2", "Maile", "maile2"), acct("a4", "c3", "Nicky", "nicky")];
const { creators, unmatched } = rollUpCreators(accounts, [row("a1", 3, 3000, 2400), row("a2", 2, 5000, 4000), row("a3", 1, 1000, 800), row("zz", 9, 900, 700)]);
check("three creators, two accounts merged", creators?.length === 3 && creators[0].creatorId === "c2" && creators[0].accountIds.length === 2);
check("merged gross and net are summed", creators![0].grossCents === 6000 && creators![0].netCents === 4800 && creators![0].paymentCount === 3);
check("sorted by gross, highest first", creators!.map(c => c.creatorId).join() === "c2,c1,c3");
check("creator without payments is listed with zero", creators![2].grossCents === 0 && creators![2].paymentCount === 0);
check("shares add to 1", Math.abs(creators!.reduce((t, c) => t + (c.share ?? 0), 0) - 1) < 1e-9 && creators![0].share === 6000 / 9000);
check("rows for unknown accounts are reported, not added", unmatched.length === 1 && unmatched[0].id === "zz" && creators!.every(c => c.grossCents <= 6000));
const partial = rollUpCreators([acct("a1", "c1", "Naomi", "n")], [row("a1", 1, 100, null)]);
check("missing net is null, never zero", partial.creators![0].netCents === null);
check("no statistics means no table", rollUpCreators(accounts, null).creators === null);
check("all-zero fleet has null shares", rollUpCreators(accounts, []).creators!.every(c => c.share === null));

(async () => {
  const none = await loadOnlyFansRevenue(null, "30d", new Date("2026-11-01T00:00:00Z"));
  check("no backend -> unavailable, no creators, no zero totals", none.creators === null && none.figures.netCents === null && none.accountsError !== null);
  check("30d window spans 30 days", Date.parse(none.window.end) - Date.parse(none.window.start) === 30 * 86400000);
  const nav = ONLYFANS_CHANNEL.nav.find(i => i.key === "of-revenue");
  check("Revenue nav entry points at /onlyfans/revenue", nav?.href === "/onlyfans/revenue" && nav.label === "Revenue");
  check("OnlyFans-only mode allows /onlyfans/revenue", /ALLOW_PREFIX[\s\S]*"\/onlyfans"/.test(readFileSync(join(__dirname, "../lib/app-mode.ts"), "utf8")));
  if (failed) { console.log(`${failed} failed`); process.exit(1); }
  console.log("all passed");
})();

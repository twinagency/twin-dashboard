// Twin V2 bundle cards in the Revenue sales list: the charge names the real bundle and the offer, the offer record gives the file count and
// the quoted Stars, and everything degrades quietly before the migration. Offline: a fake query builder, no database.
import { joinV2BundleSales, loadV2BundleSales, v2BundleLabel } from "../lib/v2-bundle-sales";

let fails = 0, n = 0;
const check = (name: string, c: boolean, detail = "") => { n++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`); if (!c) fails++; };
const OFFER = "9e8d7c6b-5a49-4382-b1a0-f0e1d2c3b4a5", BUNDLE = "5b1f0c3e-7a44-4d0b-9f10-0a1b2c3d4e5f";
const offers = [{ id: OFFER, bundle_id: BUNDLE, bundle_name: "Shower set", manifest: [{}, {}, {}], quoted_stars: 1200, stored_stars: 1200 }];

const j = joinV2BundleSales([{ id: "c1", media_id: BUNDLE, v2_offer_id: OFFER.toUpperCase() }, { id: "c2", media_id: null, v2_offer_id: null }], offers);
check("only a charge with an offer id gets V2 bundle information", j.size === 1 && j.has("c1") && !j.has("c2"));
const s = j.get("c1")!;
check("the sale names the real bundle (from the charge), the offer, the file count and the quote", s.bundleId === BUNDLE && s.offerId === OFFER && s.name === "Shower set" && s.files === 3 && s.quotedStars === 1200 && s.storedStars === 1200);
check("label shows name and number of files", v2BundleLabel(s) === "Shower set · 3 files");
const gone = joinV2BundleSales([{ id: "c3", media_id: BUNDLE, v2_offer_id: OFFER }], []);
check("an offer record that cannot be read leaves the product (bundle id) and drops nothing else", gone.get("c3")?.bundleId === BUNDLE && gone.get("c3")?.files === null && v2BundleLabel(gone.get("c3")!) === "Bundle");

// fake PostgREST-style builder
const builder = (table: string, tables: Record<string, any>) => {
  const q: any = { select: () => q, in: () => q, not: () => q, then: (res: any) => res(tables[table] ?? { data: null, error: { message: "relation does not exist" } }) };
  return q;
};
const db = (tables: Record<string, any>) => ({ from: (t: string) => builder(t, tables) });
async function main() {
const ok = await loadV2BundleSales(db({ star_transactions: { data: [{ id: "c1", media_id: BUNDLE, v2_offer_id: OFFER }], error: null }, v2_bundle_offers: { data: offers, error: null } }), ["c1", "c2"]);
check("loads and joins", ok.get("c1")?.files === 3);
const noTable = await loadV2BundleSales(db({ star_transactions: { data: [{ id: "c1", media_id: BUNDLE, v2_offer_id: OFFER }], error: null } }), ["c1"]);
check("before the migration the offer table is missing: the sale still names its bundle", noTable.get("c1")?.bundleId === BUNDLE && noTable.get("c1")?.files === null);
const noCol = await loadV2BundleSales(db({ star_transactions: { data: null, error: { message: "column star_transactions.v2_offer_id does not exist" } } }), ["c1"]);
check("before the migration the offer column is missing: empty, no throw", noCol.size === 0);
const boom = await loadV2BundleSales({ from: () => { throw new Error("network"); } } as any, ["c1"]);
check("a thrown read never breaks the Revenue page", boom.size === 0);
check("no ids, no query", (await loadV2BundleSales({ from: () => { throw new Error("must not be called"); } } as any, [])).size === 0);
}
main().then(() => { console.log(fails ? `\n${fails} FAILED of ${n}` : `\nall ${n} V2 bundle sales checks passed`); process.exit(fails ? 1 : 0); });

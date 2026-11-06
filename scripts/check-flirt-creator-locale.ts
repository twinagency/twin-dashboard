import assert from "node:assert/strict";
import { flirtCreatorCopy, flirtCreatorLocaleCookie, parseFlirtCreatorLocale } from "../lib/flirt-creator-locale";
import { fmtDisplayMoney, fmtNum, usdToDisplayMoney } from "../lib/money";

assert.equal(parseFlirtCreatorLocale("pt-BR"), "pt-BR");
assert.equal(parseFlirtCreatorLocale("en"), "en");
for (const invalid of ["pt-PT", "pt-br", "en-US", "", undefined, "https://elsewhere.example"]) {
  assert.equal(parseFlirtCreatorLocale(invalid), null);
}
assert.deepEqual(flirtCreatorLocaleCookie("pt-BR", true), {
  name: "flirt_creator_locale",
  value: "pt-BR",
  path: "/",
  maxAge: 31_536_000,
  httpOnly: true,
  sameSite: "lax",
  secure: true,
});
assert.equal(flirtCreatorCopy("pt-BR")("Earnings", "Ganhos"), "Ganhos");
assert.equal(flirtCreatorCopy("en")("Earnings", "Ganhos"), "Earnings");
assert.equal(fmtDisplayMoney(1234.56, "BRL", "pt-BR").replace(/\s/g, " "), "R$ 1.234,56");
assert.equal(fmtDisplayMoney(1234.56, "AUD", "en"), "A$1,234.56");
assert.equal(fmtNum(1234, "pt-BR"), "1.234");
assert.equal(usdToDisplayMoney(12, "BRL", 5), 60);
assert.equal(usdToDisplayMoney(12, "USD", 5), 12);
console.log("FLIRT creator locale, cookie policy, and currency formatting passed.");

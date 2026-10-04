import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const frame = readFileSync("components/CreatorAuthFrame.tsx", "utf8");
const globals = readFileSync("app/globals.css", "utf8");

const inputClass = frame.match(/export const tetherAuthInputClass = "([^"]+)";/)?.[1];
assert.ok(inputClass, "The shared Tether creator auth input class is missing");
assert.match(inputClass, /\btether-auth-input\b/);
assert.match(inputClass, /\bbg-white\b/);
assert.match(inputClass, /(?:^|\s)text-\[#080a0e\](?:\s|$)/);
assert.match(inputClass, /(?:^|\s)caret-\[#080a0e\](?:\s|$)/);
assert.doesNotMatch(inputClass, /\btext-white(?:\/\d+)?\b|\bbg-black(?:\/\d+)?\b/);

for (const file of [
  "components/CreatorForgotPasswordScreen.tsx",
  "components/CreatorResetPasswordScreen.tsx",
]) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /const dark = tether \|\| !!agencyBrand\?\.dark;/, `${file} must retain Tether in the dark recovery treatment`);
  assert.match(source, /className=\{dark \? tetherAuthInputClass : undefined\}/, `${file} must use the shared Tether input treatment for dark recovery`);
}
// CreatorSignupScreen.tsx and CreatorLoginScreen.tsx also offer this
// treatment to a dark-brand agency invite/login (Moxy), so their gate is
// darkForm (tether || a dark invite) rather than tether alone. All three
// must still resolve to the same shared input class.
for (const file of ["components/CreatorSignupScreen.tsx", "components/CreatorLoginScreen.tsx"]) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /const darkForm = tether \|\| !!invited\?\.dark;/, `${file} must gate the dark form on tether or a dark agency invite`);
  assert.match(source, /className=\{darkForm \? tetherAuthInputClass : undefined\}/, `${file} must use the shared Tether input treatment for darkForm`);
}

assert.match(globals, /\[data-creator-auth-brand="tether"\] \.tether-auth-input,?\s*(?:\[data-creator-auth-brand="moxy"\] \.tether-auth-input,?\s*)?\{[\s\S]*?color:\s*#080a0e;[\s\S]*?background-color:\s*#ffffff;/);
assert.match(globals, /\[data-creator-auth-brand="tether"\] input\.tether-auth-input:-webkit-autofill/);
assert.match(globals, /-webkit-text-fill-color:\s*#080a0e !important;/);
assert.match(globals, /-webkit-box-shadow:\s*0 0 0 1000px #ffffff inset !important;/);
assert.doesNotMatch(globals, /\[data-creator-auth-brand="twin"\][^{]*tether-auth-input/);
// A dark-brand agency invite is scoped by its own slug ("moxy"), never by
// "twin", so the dark treatment cannot leak onto plain Twin creator pages.
assert.match(globals, /\[data-creator-auth-brand="moxy"\] \.tether-auth-input/);
assert.match(globals, /\[data-creator-auth-brand="moxy"\] input\.tether-auth-input:-webkit-autofill/);

console.log("TETHER AUTH UI PASSED: typed and autofilled values stay dark on light inputs across signup, login, forgot-password and reset-password without changing Twin auth.");

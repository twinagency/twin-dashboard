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
  "components/CreatorLoginScreen.tsx",
  "components/CreatorSignupScreen.tsx",
  "components/CreatorForgotPasswordScreen.tsx",
  "components/CreatorResetPasswordScreen.tsx",
]) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /className=\{tether \? tetherAuthInputClass : undefined\}/, `${file} must use the shared Tether input treatment`);
}

assert.match(globals, /\[data-creator-auth-brand="tether"\] \.tether-auth-input\s*\{[\s\S]*?color:\s*#080a0e;[\s\S]*?background-color:\s*#ffffff;/);
assert.match(globals, /\[data-creator-auth-brand="tether"\] input\.tether-auth-input:-webkit-autofill/);
assert.match(globals, /-webkit-text-fill-color:\s*#080a0e !important;/);
assert.match(globals, /-webkit-box-shadow:\s*0 0 0 1000px #ffffff inset !important;/);
assert.doesNotMatch(globals, /\[data-creator-auth-brand="twin"\][^{]*tether-auth-input/);

console.log("TETHER AUTH UI PASSED: typed and autofilled values stay dark on light inputs across signup, login, forgot-password and reset-password without changing Twin auth.");

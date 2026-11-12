// Sync resolve hook (node:module registerHooks, covers both import and require, no CLI flag). Redirects the
// "use server" action modules and CSS modules to in-memory fakes, matched on the RESOLVED url so every import form
// (alias, relative) is caught. Nothing real behind those modules is ever loaded.
import { registerHooks } from "node:module";
const here = new URL("./", import.meta.url);
const REDIRECT = [
  [/\/app\/clones\/actions\.ts$/, "clones-actions.mjs"],
  [/\/app\/media\/actions\.ts$/, "media-actions.mjs"],
];
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/\.module\.css$/.test(specifier)) return { url: new URL("css-module.mjs", here).href, format: "module", shortCircuit: true };
    const r = nextResolve(specifier, context);
    for (const [re, file] of REDIRECT) if (re.test(r.url.split("?")[0])) return { url: new URL(file, here).href, format: "module", shortCircuit: true };
    return r;
  },
});

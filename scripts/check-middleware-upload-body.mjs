import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import config from "../next.config.mjs";

const require = createRequire(import.meta.url);
const { getCloneableBody } = require("next/dist/server/body-streams.js");
const bytes = require("next/dist/compiled/bytes");
const MiB = 1024 * 1024;
const limit = typeof config.experimental.middlewareClientMaxBodySize === "number"
  ? config.experimental.middlewareClientMaxBodySize
  : bytes.parse(config.experimental.middlewareClientMaxBodySize);
const actionLimit = bytes.parse(config.experimental.serverActions.bodySizeLimit);
assert.equal(actionLimit, 50 * MiB, "The existing server-action limit stays 50 MB");
assert.equal(limit, actionLimit, "Middleware must preserve the complete authorized action body");

async function clonedBytes(size, configuredLimit) {
  const chunk = Buffer.alloc(64 * 1024, 7);
  const body = Readable.from((function* () {
    for (let offset = 0; offset < size; offset += chunk.length) yield chunk.subarray(0, Math.min(chunk.length, size - offset));
  })());
  const clone = getCloneableBody(body, configuredLimit).cloneBodyStream();
  let copied = 0;
  for await (const value of clone) copied += value.length;
  return copied;
}

// Execute the installed Next.js transport, not a replica of its limit check.
for (const size of [9 * MiB, 24 * MiB, 49 * MiB + 64 * 1024]) {
  assert.equal(await clonedBytes(size, limit), size, "Approved media plus multipart overhead must reach the action intact");
}
const previousWarn = console.warn;
try {
  console.warn = () => {};
  assert.equal(await clonedBytes(24 * MiB, undefined), 10 * MiB, "Regression fixture reproduces Next's default 10 MB truncation");
  assert.equal(await clonedBytes(51 * MiB, limit), 50 * MiB, "Bodies above the configured ceiling stay bounded");
} finally { console.warn = previousWarn; }
console.log("PASS middleware upload body: 9 MB, 24 MB and maximum campaign upload preserved; 50 MB ceiling enforced");

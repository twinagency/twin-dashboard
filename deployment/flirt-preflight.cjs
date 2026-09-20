"use strict";
// Host-only startup code. Keep file-based secrets out of application bundles.
require("./flirt-shared-services.cjs");
const { assertStartup } = require("./flirt-environment.cjs");
try {
  assertStartup(process.argv[2]);
  console.log("FLIRT startup configuration passed. No network requests made.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

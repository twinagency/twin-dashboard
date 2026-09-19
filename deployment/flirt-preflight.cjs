"use strict";
const { assertStartup } = require("./flirt-environment.cjs");
try {
  assertStartup(process.argv[2]);
  console.log("FLIRT startup configuration passed. No network requests made.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

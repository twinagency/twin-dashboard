"use strict";

const { assertDatabase } = require("./flirt-environment.cjs");
const project = require("./flirt-project.json");

function validateTarget(env) {
  if (assertDatabase(env) !== project.project_ref) {
    throw new Error("Storage setup requires the approved FLIRT project");
  }
}

function matches(actual, expected) {
  const mime = (value) => [...(value || [])].sort().join(",");
  return actual.id === expected.id && actual.name === expected.name
    && actual.public === false
    && Number(actual.file_size_limit) === expected.file_size_limit
    && mime(actual.allowed_mime_types) === mime(expected.allowed_mime_types);
}

async function provision(storage, createMissing = false) {
  const { data: existing, error } = await storage.listBuckets();
  if (error || !Array.isArray(existing)) throw new Error("Could not read FLIRT storage configuration");
  // Validate every existing bucket before creating anything. Never make an
  // existing bucket public or silently change its upload rules.
  for (const expected of project.buckets) {
    const actual = existing.find((bucket) => bucket.id === expected.id);
    if (actual && !matches(actual, expected)) {
      throw new Error(`FLIRT bucket configuration differs: ${expected.id}`);
    }
  }
  const missing = project.buckets.filter((expected) => !existing.some((bucket) => bucket.id === expected.id));
  if (missing.length && !createMissing) throw new Error("FLIRT buckets are missing; use --create after verifying the project upload-size limit");
  for (const bucket of missing) {
    const { error: createError } = await storage.createBucket(bucket.id, {
      public: false,
      fileSizeLimit: bucket.file_size_limit,
      ...(bucket.allowed_mime_types ? { allowedMimeTypes: bucket.allowed_mime_types } : {}),
    });
    if (createError) throw new Error(`Could not create FLIRT bucket: ${bucket.id}. Check project upload limits and server credentials.`);
  }
  const { data: verified, error: verifyError } = await storage.listBuckets();
  if (verifyError || !Array.isArray(verified)
    || project.buckets.some((expected) => !verified.some((actual) => matches(actual, expected)))) {
    throw new Error("FLIRT bucket verification failed");
  }
  return { verified: project.buckets.length, created: missing.length };
}

async function main() {
  const flag = process.argv[2];
  if (process.argv.length > 3 || (flag && !["--check", "--create"].includes(flag))) throw new Error("Use --check or --create");
  validateTarget(process.env);
  const { createClient } = require("@supabase/supabase-js");
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  console.log(JSON.stringify(await provision(client.storage, flag === "--create")));
}

module.exports = { validateTarget, provision };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

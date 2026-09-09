import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REHEARSAL_REF = 'uggnrwotrnjahjapeeyo';
export const PRODUCTION_REF = 'aouaenqayfltoqrmpitg';
export const LEGACY_PROJECT = '29c8f571-710e-4856-9a91-ed5ad9b4a251';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GROUPS = ['profiles', 'questionnaires', 'progress', 'consents', 'files', 'clone_links'];
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => JSON.stringify(value, function (key, item) {
  return item && !Array.isArray(item) && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item;
});
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const placeholderKeys = ['legacy_payload_preserved', 'migration_verified', 'legacy_answer_field_count'];
export const containsPlaceholder = answers => placeholderKeys.some(key => Object.hasOwn(answers, key));
export function safePath(value) {
  assert.equal(typeof value, 'string', 'Storage path must be text');
  assert.ok(value.length && !/[\\\x00-\x1f?#%]/.test(value), 'Unsafe storage path');
  assert.ok(value.split('/').every(p => p && p !== '.' && p !== '..'), 'Unsafe storage path');
  return value;
}
export function targetRef(ref) {
  assert.equal(ref, REHEARSAL_REF, 'Only the approved rehearsal project is allowed');
  return ref;
}

// Single SELECT = one consistent database snapshot. No auth secrets or Storage writes.
export function exportSql() {
  const specs = [
    ['profiles', 'profiles', 'id'], ['questionnaires', 'questionnaire_responses', 'user_id'],
    ['progress', 'onboarding_progress', 'user_id'], ['consents', 'consent_signatures', 'user_id'],
    ['files', 'uploaded_files', 'user_id'], ['clone_links', 'creator_api_links', 'user_id'],
  ];
  const pairs = specs.map(([key, table, owner]) => {
    const row = key === 'questionnaires'
      ? "to_jsonb(t) || jsonb_build_object('answers_text', t.answers::text, 'answers_sha256', encode(sha256(convert_to(t.answers::text, 'UTF8')), 'hex'))"
      : 'to_jsonb(t)';
    return `'${key}', (select coalesce(jsonb_agg(${row} order by t.${owner}), '[]'::jsonb) from public.${table} t where t.${owner} in (select id from creators))`;
  });
  return `with creators as (select id from public.profiles where account_type='creator'), payload as (\nselect jsonb_build_object('version',1,'source_project_id','${LEGACY_PROJECT}','exported_at',now(),\n${pairs.join(',\n')}) as data)\nselect data::text as payload_text, encode(sha256(convert_to(data::text,'UTF8')),'hex') as payload_sha256 from payload;\n`;
}

export function validateExport(input) {
  const envelope = Array.isArray(input) ? input[0] : input;
  if (Array.isArray(input)) assert.equal(input.length, 1, 'Expected one snapshot');
  assert.ok(object(envelope), 'Missing export envelope');
  assert.equal(typeof envelope.payload_text, 'string', 'Export must include exact payload_text');
  assert.match(envelope.payload_sha256 ?? '', /^[a-f0-9]{64}$/, 'Missing source checksum');
  assert.equal(sha256(envelope.payload_text), envelope.payload_sha256, 'Snapshot checksum mismatch');
  const data = JSON.parse(envelope.payload_text);
  assert.equal(data.version, 1, 'Unsupported export version');
  assert.equal(data.source_project_id, LEGACY_PROJECT, 'Wrong source project');
  assert.ok(timestamp(data.exported_at), 'Missing snapshot time');
  for (const key of GROUPS) assert.ok(Array.isArray(data[key]), `Missing ${key} array`);
  const owners = new Set(); const emails = new Set();
  for (const p of data.profiles) {
    assert.ok(object(p) && UUID.test(p.id), 'Invalid profile ID');
    assert.equal(p.account_type, 'creator', 'Non-creator in creator snapshot');
    assert.ok(!owners.has(p.id), 'Duplicate creator ID'); owners.add(p.id);
    if (p.email) {
      assert.equal(typeof p.email, 'string', 'Invalid profile email');
      const normalized = p.email.trim().toLowerCase();
      assert.ok(!emails.has(normalized), 'Duplicate creator email needs review'); emails.add(normalized);
    }
  }
  assert.ok(owners.size > 0, 'Refuse an empty creator snapshot');
  for (const key of GROUPS.filter(k => k !== 'profiles')) {
    const ids = new Set();
    for (const row of data[key]) {
      assert.ok(object(row) && owners.has(row.user_id), `Orphan in ${key}`);
      const id = ['questionnaires', 'progress', 'clone_links'].includes(key) ? row.user_id : row.id;
      assert.ok(UUID.test(id), `Invalid ID in ${key}`);
      assert.ok(!ids.has(id), `Duplicate in ${key}`); ids.add(id);
    }
  }
  for (const q of data.questionnaires) {
    assert.ok(object(q.answers), 'Answers must be a JSON object');
    assert.ok(!containsPlaceholder(q.answers), 'Placeholder answers are not source data');
    assert.equal(typeof q.answers_text, 'string', 'Missing original answer JSON');
    assert.equal(sha256(q.answers_text), q.answers_sha256, 'Answer checksum mismatch');
    assert.equal(canonical(JSON.parse(q.answers_text)), canonical(q.answers), 'Answer JSON mismatch');
    assert.ok(['draft', 'submitted'].includes(q.status), 'Unknown application status needs review');
    assert.ok(timestamp(q.created_at) && timestamp(q.updated_at), 'Missing questionnaire dates');
  }
  const paths = new Set();
  for (const f of data.files) {
    assert.ok(['content', 'voice'].includes(f.kind), 'Unknown file kind');
    assert.equal(f.bucket, f.kind === 'voice' ? 'voice-samples' : 'onboarding-content', 'Unexpected source bucket');
    safePath(f.path);
    assert.equal(f.path.split('/')[0], f.user_id, 'File path belongs to a different creator');
    assert.ok(Number.isSafeInteger(f.size_bytes) && f.size_bytes >= 0, 'Missing/unsafe file size');
    assert.ok(timestamp(f.created_at), 'Missing file creation time');
    assert.equal(typeof f.mime_type, 'string', 'Missing MIME type');
    assert.ok(/^[\w.+-]+\/[\w.+-]+$/.test(f.mime_type), 'Invalid MIME type');
    const key = `${f.bucket}/${f.path}`;
    assert.ok(!paths.has(key), 'Duplicate storage path needs review'); paths.add(key);
  }
  return { data, envelope, summary: {
    ...Object.fromEntries(GROUPS.map(key => [key, data[key].length])),
    questionnaire_answer_fields: data.questionnaires.reduce((sum, q) => sum + Object.keys(q.answers).length, 0),
    media_bytes: data.files.reduce((sum, f) => sum + f.size_bytes, 0),
    physically_copied_files: 0, login_migrated: false,
  } };
}

export function buildPlan(input, ref = REHEARSAL_REF) {
  targetRef(ref);
  const { data, envelope, summary } = validateExport(input);
  const files = data.files.map(f => ({
    legacy_id: f.id, legacy_user_id: f.user_id, source_bucket: f.bucket, source_path: f.path,
    size_bytes: f.size_bytes, mime_type: f.mime_type,
    target_bucket: 'creator-onboarding', target_path: `legacy/${f.user_id}/${f.id}`,
  }));
  return { version: 1, target_ref: ref, snapshot_sha256: envelope.payload_sha256, summary, files };
}

// Preparation only. Apply via an approved database connection after branch drift review.
// A caller-provided project label is NOT proof of the connected database's identity.
export function buildImportSql(input, ref = REHEARSAL_REF) {
  targetRef(ref);
  const { data, envelope } = validateExport(input);
  const encoded = Buffer.from(envelope.payload_text).toString('base64');
  return `-- REHEARSAL ONLY: ${ref}. Not an automatically applied migration.
-- This script stages file metadata. It does NOT copy bytes or migrate Auth.
BEGIN;
SET LOCAL standard_conforming_strings = on;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SELECT pg_advisory_xact_lock(hashtext('creator-migration-rehearsal'));
CREATE SCHEMA IF NOT EXISTS creator_migration_private;
REVOKE ALL ON SCHEMA creator_migration_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS creator_migration_private.snapshots (
  sha256 text PRIMARY KEY, payload jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creator_migration_private.file_inventory (
  legacy_id uuid PRIMARY KEY, creator_account_id uuid NOT NULL REFERENCES public.creator_accounts(id),
  metadata jsonb NOT NULL, snapshot_sha256 text NOT NULL,
  target_bucket text NOT NULL, target_path text NOT NULL,
  copy_status text NOT NULL DEFAULT 'pending' CHECK (copy_status IN ('pending','verified')),
  copied_sha256 text, verified_at timestamptz,
  CHECK (copy_status <> 'verified' OR (copied_sha256 ~ '^[a-f0-9]{64}$' AND verified_at IS NOT NULL))
);
REVOKE ALL ON ALL TABLES IN SCHEMA creator_migration_private FROM PUBLIC, anon, authenticated;
CREATE TEMP TABLE import_payload (data jsonb) ON COMMIT DROP;
INSERT INTO import_payload SELECT convert_from(decode('${encoded}','base64'),'UTF8')::jsonb;
DO $migration$
DECLARE source jsonb; row_data jsonb; creator_id uuid; target_id uuid; current_answers jsonb; current_status text;
BEGIN
  SELECT data INTO STRICT source FROM import_payload;
  IF encode(sha256(convert_to(source::text,'UTF8')),'hex') <> '${envelope.payload_sha256}' THEN
    RAISE EXCEPTION 'Snapshot checksum mismatch in PostgreSQL';
  END IF;
  IF (SELECT count(*) FROM public.creator_accounts ca JOIN jsonb_array_elements(source->'profiles') p ON ca.legacy_lovable_user_id=(p->>'id')::uuid) <> ${data.profiles.length} THEN
    RAISE EXCEPTION 'Creator mapping incomplete; refusing partial import';
  END IF;
  IF EXISTS (SELECT 1 FROM public.creator_files WHERE bucket='legacy-lovable-reference' OR storage_path LIKE 'legacy://%') THEN
    RAISE EXCEPTION 'Placeholder media rows require explicit review before import';
  END IF;
  INSERT INTO creator_migration_private.snapshots(sha256,payload) VALUES ('${envelope.payload_sha256}',source) ON CONFLICT DO NOTHING;
  FOR row_data IN SELECT value FROM jsonb_array_elements(source->'questionnaires') LOOP
    SELECT ca.id INTO STRICT creator_id FROM public.creator_accounts ca WHERE ca.legacy_lovable_user_id=(row_data->>'user_id')::uuid;
    SELECT a.id,a.answers,a.status INTO STRICT target_id,current_answers,current_status FROM public.creator_applications a WHERE a.creator_account_id=creator_id AND a.legacy_created_at=(row_data->>'created_at')::timestamptz FOR UPDATE;
    IF current_status <> row_data->>'status' THEN RAISE EXCEPTION 'Application status changed; review required'; END IF;
    IF current_answers <> '{}'::jsonb AND current_answers <> row_data->'answers'
      AND NOT (current_answers - ARRAY['legacy_payload_preserved','migration_verified','legacy_answer_field_count'] = '{}'::jsonb AND (current_answers ? 'legacy_payload_preserved' OR current_answers ? 'migration_verified')) THEN
      RAISE EXCEPTION 'Existing answers differ; refusing to overwrite genuine answers';
    END IF;
    IF encode(sha256(convert_to(row_data->>'answers_text','UTF8')),'hex') <> row_data->>'answers_sha256' THEN RAISE EXCEPTION 'Answer checksum mismatch'; END IF;
    UPDATE public.creator_applications SET answers=(row_data->>'answers_text')::jsonb WHERE id=target_id;
    IF (SELECT answers FROM public.creator_applications WHERE id=target_id) IS DISTINCT FROM row_data->'answers' THEN RAISE EXCEPTION 'Answer import mismatch'; END IF;
  END LOOP;
  FOR row_data IN SELECT value FROM jsonb_array_elements(source->'files') LOOP
    SELECT ca.id INTO STRICT creator_id FROM public.creator_accounts ca WHERE ca.legacy_lovable_user_id=(row_data->>'user_id')::uuid;
    IF EXISTS (SELECT 1 FROM creator_migration_private.file_inventory f WHERE f.legacy_id=(row_data->>'id')::uuid AND (f.metadata IS DISTINCT FROM row_data OR f.creator_account_id<>creator_id)) THEN RAISE EXCEPTION 'Previously staged file changed; review required'; END IF;
    INSERT INTO creator_migration_private.file_inventory(legacy_id,creator_account_id,metadata,snapshot_sha256,target_bucket,target_path)
      VALUES ((row_data->>'id')::uuid,creator_id,row_data,'${envelope.payload_sha256}','creator-onboarding','legacy/'||(row_data->>'user_id')||'/'||(row_data->>'id')) ON CONFLICT DO NOTHING;
  END LOOP;
  IF (SELECT count(*) FROM creator_migration_private.file_inventory f JOIN jsonb_array_elements(source->'files') s ON f.legacy_id=(s->>'id')::uuid AND f.metadata=s) <> ${data.files.length} THEN RAISE EXCEPTION 'File inventory does not reconcile'; END IF;
END $migration$;
SELECT jsonb_build_object('questionnaires_verified',${data.questionnaires.length},'file_records_staged',${data.files.length},'bytes_copied_by_this_script',0,'auth_migrated',false) AS reconciliation;
COMMIT;
`;
}

export function buildFinalizeSql(input, receipts) {
  const plan = buildPlan(input); targetRef(receipts.target_ref);
  assert.equal(receipts.version, 1, 'Unsupported receipt version');
  assert.equal(receipts.snapshot_sha256, plan.snapshot_sha256, 'Receipts belong to another snapshot');
  assert.ok(Array.isArray(receipts.files), 'Missing verification receipts');
  assert.equal(receipts.files.length, plan.files.length, 'Storage verification is incomplete');
  const expected = new Map(plan.files.map(f => [f.legacy_id, f])); const seen = new Set();
  for (const r of receipts.files) {
    const f = expected.get(r.legacy_id); assert.ok(f && !seen.has(r.legacy_id), 'Unexpected/duplicate receipt'); seen.add(r.legacy_id);
    assert.equal(r.target_bucket, f.target_bucket); assert.equal(r.target_path, f.target_path);
    assert.equal(r.size_bytes, f.size_bytes); assert.match(r.source_sha256, /^[a-f0-9]{64}$/);
    assert.equal(r.target_sha256, r.source_sha256, 'Storage checksums do not match');
    assert.ok(timestamp(r.verified_at), 'Missing storage verification time');
  }
  const encoded = Buffer.from(JSON.stringify(receipts)).toString('base64');
  return `-- REHEARSAL ONLY. Finalize only after independently downloading and hashing target objects.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtext('creator-migration-rehearsal'));
DO $finalize$
DECLARE receipts jsonb := convert_from(decode('${encoded}','base64'),'UTF8')::jsonb;
receipt jsonb; item creator_migration_private.file_inventory%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM creator_migration_private.snapshots WHERE sha256='${plan.snapshot_sha256}') THEN RAISE EXCEPTION 'Source snapshot has not been staged'; END IF;
  FOR receipt IN SELECT value FROM jsonb_array_elements(receipts->'files') LOOP
    SELECT * INTO STRICT item FROM creator_migration_private.file_inventory WHERE legacy_id=(receipt->>'legacy_id')::uuid FOR UPDATE;
    IF item.target_bucket IS DISTINCT FROM receipt->>'target_bucket' OR item.target_path IS DISTINCT FROM receipt->>'target_path'
      OR (item.metadata->>'size_bytes')::bigint IS DISTINCT FROM (receipt->>'size_bytes')::bigint THEN RAISE EXCEPTION 'Receipt does not match staged file'; END IF;
    IF NOT EXISTS (SELECT 1 FROM creator_migration_private.snapshots s, jsonb_array_elements(s.payload->'files') f WHERE s.sha256='${plan.snapshot_sha256}' AND f=item.metadata) THEN RAISE EXCEPTION 'File not in approved snapshot'; END IF;
    IF EXISTS (SELECT 1 FROM public.creator_files f WHERE f.legacy_id=item.legacy_id AND (f.creator_account_id<>item.creator_account_id OR f.bucket<>item.target_bucket OR f.storage_path<>item.target_path OR f.size_bytes IS DISTINCT FROM (receipt->>'size_bytes')::bigint)) THEN RAISE EXCEPTION 'Existing creator file conflicts with migration'; END IF;
    INSERT INTO public.creator_files(creator_account_id,kind,bucket,storage_path,mime_type,size_bytes,original_name,legacy_id,legacy_bucket,legacy_path,created_at)
    VALUES(item.creator_account_id,item.metadata->>'kind',item.target_bucket,item.target_path,item.metadata->>'mime_type',(item.metadata->>'size_bytes')::bigint,item.metadata->>'original_name',item.legacy_id,item.metadata->>'bucket',item.metadata->>'path',(item.metadata->>'created_at')::timestamptz)
    ON CONFLICT(legacy_id) DO NOTHING;
    UPDATE creator_migration_private.file_inventory SET copy_status='verified',copied_sha256=receipt->>'target_sha256',verified_at=(receipt->>'verified_at')::timestamptz WHERE legacy_id=item.legacy_id;
  END LOOP;
END $finalize$;
SELECT jsonb_build_object('verified_file_records',${plan.files.length},'auth_migrated',false,'consent_image_transfer_verified',false) AS result;
COMMIT;
`;
}

export function hardeningSql() {
  return `-- REHEARSAL ONLY. Draft; review and test before applying. No production rollout.
BEGIN;
DO $permissions$
DECLARE policy record; table_name text;
BEGIN
  FOR policy IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('creator_accounts','creator_applications','creator_onboarding_progress','creator_consents','creator_files','creator_agency_assignments','creator_clone_links') AND cmd<>'SELECT' LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I',policy.policyname,policy.schemaname,policy.tablename);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['creator_accounts','creator_applications','creator_onboarding_progress','creator_consents','creator_files','creator_agency_assignments','creator_clone_links'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',table_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated',table_name);
  END LOOP;
END $permissions$;
-- Existing own-account SELECT policies remain. No browser writes until server-side
-- validation and separate ownership/status/consent/file authorization tests pass.
COMMIT;
`;
}

export async function main(argv = process.argv.slice(2)) {
  const [command, inputFile, outputPath] = argv;
  if (command === 'export-sql') { process.stdout.write(exportSql()); return; }
  if (command === 'finalize-sql') {
    assert.ok(inputFile && outputPath, 'Usage: node prepare.mjs finalize-sql export.json verified-receipts.json');
    process.stdout.write(buildFinalizeSql(JSON.parse(await readFile(inputFile, 'utf8')), JSON.parse(await readFile(outputPath, 'utf8')))); return;
  }
  if (command === 'hardening-sql') { process.stdout.write(hardeningSql()); return; }
  assert.ok(command === 'prepare' && inputFile && outputPath, 'Usage: node prepare.mjs prepare export.json /private/output-directory');
  const input = JSON.parse(await readFile(inputFile, 'utf8'));
  const plan = buildPlan(input); const sql = buildImportSql(input);
  const out = resolve(outputPath); await mkdir(out, { mode: 0o700 });
  await writeFile(resolve(out, 'import-rehearsal.sql'), sql, { flag: 'wx', mode: 0o600 });
  await writeFile(resolve(out, 'storage-plan.json'), JSON.stringify(plan, null, 2), { flag: 'wx', mode: 0o600 });
  await writeFile(resolve(out, 'summary.json'), JSON.stringify(plan.summary, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ state: 'prepared_only', ...plan.summary }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPlan, buildImportSql, buildFinalizeSql, exportSql, hardeningSql, validateExport, sha256, LEGACY_PROJECT, REHEARSAL_REF, PRODUCTION_REF } from './prepare.mjs';
import { validatePlan, connection, validateUploadUrl, digestBody, copyOne, uploadResumable, main as copyMain, CHUNK_SIZE } from './copy-storage.mjs';
const USER = '10000000-0000-4000-8000-000000000001';
const FILE = '20000000-0000-4000-8000-000000000001';
const SOURCE = 'abcdefghijklmnopqrst';
function fixture(change = () => {}) {
  const answers = { name: "Synthetic O'Example", multiline: 'one\ntwo', unicode: 'Test 🧪', nested: { first: 1, second: false }, quote: "'); DROP TABLE users; --", blank: '' };
  const data = { version: 1, source_project_id: LEGACY_PROJECT, exported_at: '2026-09-09T09:00:00Z',
    profiles: [{ id: USER, email: 'fixture@example.invalid', account_type: 'creator' }],
    questionnaires: [{ user_id: USER, answers, answers_text: JSON.stringify(answers), answers_sha256: sha256(JSON.stringify(answers)), status: 'submitted', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-02T00:00:00Z' }],
    progress: [{ user_id: USER }], consents: [], clone_links: [],
    files: [{ id: FILE, user_id: USER, kind: 'content', bucket: 'onboarding-content', path: `${USER}/example.png`, mime_type: 'image/png', size_bytes: 3, original_name: 'example.png', created_at: '2026-08-01T00:00:00Z' }],
  };
  change(data); const payload_text = JSON.stringify(data); return { payload_text, payload_sha256: sha256(payload_text) };
}
const body = bytes => new Response(bytes).body;
const token = (ref, role = 'service_role') => `test.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.test`;
const src = () => connection(SOURCE, token(SOURCE));
const dst = () => connection(REHEARSAL_REF, token(REHEARSAL_REF));
const file = () => buildPlan(fixture()).files[0];

test('real answer payload and media metadata are retained', () => {
  const { data, summary } = validateExport(fixture());
  assert.equal(summary.questionnaire_answer_fields, 6);
  assert.equal(data.questionnaires[0].answers.unicode, 'Test 🧪');
  assert.equal(summary.physically_copied_files, 0); assert.equal(summary.login_migrated, false);
});
test('empty draft answers are legitimate source data', () => {
  const input = fixture(d => { Object.assign(d.questionnaires[0], { answers: {}, answers_text: '{}', answers_sha256: sha256('{}'), status: 'draft' }); });
  assert.equal(validateExport(input).summary.questionnaire_answer_fields, 0);
});
for (const key of ['legacy_payload_preserved', 'migration_verified', 'legacy_answer_field_count']) test(`rejects false completion marker ${key}`, () => {
  assert.throws(() => validateExport(fixture(d => { d.questionnaires[0].answers[key] = true; })), /Placeholder/);
});
test('rejects corrupted snapshot', () => { const x = fixture(); x.payload_text += ' '; assert.throws(() => validateExport(x), /checksum/); });
test('rejects changed answer text even with valid envelope', () => assert.throws(() => validateExport(fixture(d => { d.questionnaires[0].answers_text = '{}'; })), /checksum/));
test('rejects answer object inconsistent with original text', () => assert.throws(() => validateExport(fixture(d => { d.questionnaires[0].answers.name = 'changed'; })), /JSON mismatch/));
test('refuses the production target', () => assert.throws(() => buildPlan(fixture(), PRODUCTION_REF), /approved rehearsal/));
test('refuses arbitrary targets', () => assert.throws(() => buildImportSql(fixture(), SOURCE), /approved rehearsal/));
test('refuses another source project', () => assert.throws(() => validateExport(fixture(d => { d.source_project_id = 'other'; })), /Wrong source/));
test('refuses noncreator profiles', () => assert.throws(() => validateExport(fixture(d => { d.profiles[0].account_type = 'agency'; })), /Non-creator/));
test('refuses orphan questionnaires', () => assert.throws(() => validateExport(fixture(d => { d.questionnaires[0].user_id = FILE; })), /Orphan/));
test('refuses duplicate profiles', () => assert.throws(() => validateExport(fixture(d => { d.profiles.push(d.profiles[0]); })), /Duplicate/));
test('refuses case-insensitive duplicate emails', () => assert.throws(() => validateExport(fixture(d => { d.profiles.push({ ...d.profiles[0], id: FILE, email: ' FIXTURE@EXAMPLE.INVALID ' }); })), /Duplicate creator email/));
test('refuses duplicate applications', () => assert.throws(() => validateExport(fixture(d => { d.questionnaires.push(d.questionnaires[0]); })), /Duplicate/));
test('refuses missing source arrays', () => assert.throws(() => validateExport(fixture(d => { delete d.consents; })), /Missing consents/));
test('refuses unexpected questionnaire state', () => assert.throws(() => validateExport(fixture(d => { d.questionnaires[0].status = 'approved'; })), /Unknown application/));
for (const path of [`${USER}/../other`, `${USER}/%2e%2e/other`, `${USER}/file?token=x`, `${FILE}/file.png`, `/${USER}/file`]) test(`refuses unsafe/mismatched object path ${path}`, () => assert.throws(() => validateExport(fixture(d => { d.files[0].path = path; }))));
test('refuses missing file size', () => assert.throws(() => validateExport(fixture(d => { d.files[0].size_bytes = null; })), /file size/));
test('refuses unsafe-size numeric precision', () => assert.throws(() => validateExport(fixture(d => { d.files[0].size_bytes = 2 ** 54; })), /file size/));
test('refuses fabricated legacy reference bucket', () => assert.throws(() => validateExport(fixture(d => { d.files[0].bucket = 'legacy-lovable-reference'; })), /bucket/));
test('SQL uses a transaction and binary-safe payload, not interpolated user text', () => {
  const sql = buildImportSql(fixture()); assert.match(sql, /BEGIN;/); assert.match(sql, /COMMIT;/);
  assert.ok(!sql.includes("DROP TABLE users")); assert.match(sql, /Snapshot checksum mismatch in PostgreSQL/);
  assert.match(sql, /refusing to overwrite genuine answers/); assert.match(sql, /copy_status.*pending/);
  assert.ok(!/insert into (?:public\.)?(?:users|clones|star_transactions|auth\.users)/i.test(sql));
});
test('read-only export excludes auth credentials', () => {
  const sql = exportSql(); assert.ok(!/\b(insert|update|delete|drop|alter)\b/i.test(sql));
  assert.ok(!sql.includes('auth.users')); assert.match(sql, /payload_sha256/);
});
test('hardening removes write policies instead of enabling self approval', () => {
  const sql = hardeningSql(); assert.match(sql, /cmd<>'SELECT'/); assert.match(sql, /REVOKE ALL/);
  assert.ok(!sql.includes('GRANT UPDATE')); assert.ok(!sql.includes('GRANT INSERT'));
});
test('transfer plan preserves real IDs, paths and byte totals', () => {
  const plan = validatePlan(buildPlan(fixture())); assert.equal(plan.files[0].legacy_id, FILE);
  assert.equal(plan.files[0].source_path, `${USER}/example.png`); assert.equal(plan.summary.media_bytes, 3);
});
test('refuses tampered transfer count', () => { const p=buildPlan(fixture()); p.summary.files=542; assert.throws(() => validatePlan(p), /count mismatch/); });
test('refuses tampered target path', () => { const p=buildPlan(fixture()); p.files[0].target_path='anything'; assert.throws(() => validatePlan(p), /target path/); });
test('rejects destination credentials for another project', () => assert.throws(() => connection(REHEARSAL_REF, token(PRODUCTION_REF)), /different project/));
test('rejects anonymous credentials', () => assert.throws(() => connection(REHEARSAL_REF, token(REHEARSAL_REF,'anon')), /service-role/));
test('rejects upload redirect to another host', () => assert.throws(() => validateUploadUrl('https://example.invalid/storage/v1/upload/resumable/x', dst()), /host/));
test('rejects malicious upload route', () => assert.throws(() => validateUploadUrl(`${dst().origin}/auth/v1/admin/users`, dst()), /path/));
test('hashes complete bytes exactly', async () => assert.equal(await digestBody(body('abc'),3), sha256('abc')));
test('detects truncated object bytes', async () => assert.rejects(digestBody(body('ab'),3), /size mismatch/));
test('detects oversized object bytes', async () => assert.rejects(digestBody(body('abcd'),3), /exceeds/));
test('dry run makes no network requests', async () => {
  const dir=await mkdtemp(join(tmpdir(),'twin-dry-'));
  try { await writeFile(join(dir,'plan.json'),JSON.stringify(buildPlan(fixture())));
    await copyMain([join(dir,'plan.json'),join(dir,'work')],{},()=>{ throw new Error('Network forbidden'); });
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('copies source bytes, verifies independent target download, and avoids upsert', async () => {
  const dir=await mkdtemp(join(tmpdir(),'twin-copy-')); const bytes=Buffer.from('abc'); let uploaded=false; let offset=0; const methods=[];
  const fake=async(url,opts)=>{
    methods.push(opts.method??'GET'); assert.equal(opts.redirect,'error'); assert.equal(opts.headers['x-upsert'],undefined);
    if(url.startsWith(src().origin)) { assert.equal(opts.method,undefined); return new Response(bytes); }
    if(url.includes('/object/authenticated/')) return uploaded?new Response(bytes):new Response(null,{status:404});
    if(opts.method==='POST') return new Response(null,{status:201,headers:{location:`${dst().storageOrigin}/storage/v1/upload/resumable/test`}});
    if(opts.method==='HEAD') return new Response(null,{status:200,headers:{'upload-length':'3','upload-offset':String(offset)}});
    if(opts.method==='PATCH') { assert.deepEqual(opts.body,bytes); offset=3; uploaded=true; return new Response(null,{status:204,headers:{'upload-offset':'3'}}); }
    throw new Error('Unexpected request');
  };
  try { const receipt=await copyOne(src(),dst(),file(),dir,fake); assert.equal(receipt.target_sha256,sha256('abc')); assert.equal(receipt.source_sha256,receipt.target_sha256); assert.equal(methods.filter(x=>x==='POST').length,1); }
  finally { await rm(dir,{recursive:true,force:true}); }
});
test('resumes after server accepts a chunk but its response is lost', async () => {
  const dir=await mkdtemp(join(tmpdir(),'twin-resume-')); let offset=0; let patches=0;
  try { const path=join(dir,'file.bin'); await writeFile(path,'abc');
    const fake=async(url,opts)=>{
      if(opts.method==='POST')return new Response(null,{status:201,headers:{location:`${dst().storageOrigin}/storage/v1/upload/resumable/resume`}});
      if(opts.method==='HEAD')return new Response(null,{status:200,headers:{'upload-length':'3','upload-offset':String(offset)}});
      patches++;offset=3;throw new Error('connection dropped');
    };
    await uploadResumable(dst(),file(),path,join(dir,'state.json'),sha256('abc'),fake,async()=>{});
    assert.equal(patches,1);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('existing equal object is verified without creating a duplicate', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'twin-existing-')); const fake=async(url,opts)=>{assert.equal(opts.method,undefined);return new Response('abc');};
  try {const r=await copyOne(src(),dst(),file(),dir,fake);assert.equal(r.target_sha256,sha256('abc'));}finally{await rm(dir,{recursive:true,force:true});}
});
test('existing unequal object is not overwritten', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'twin-conflict-')); const fake=async(url,opts)=>{assert.equal(opts.method,undefined);return new Response(url.startsWith(src().origin)?'abc':'xyz');};
  try {await assert.rejects(copyOne(src(),dst(),file(),dir,fake),/refusing overwrite/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('target access denial is not treated as a missing object', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'twin-denied-')); const fake=async(url,opts)=>{assert.equal(opts.method,undefined);return url.startsWith(src().origin)?new Response('abc'):new Response(null,{status:403});};
  try {await assert.rejects(copyOne(src(),dst(),file(),dir,fake),/HTTP 403/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('TUS uses the documented six-MiB chunk size',()=>assert.equal(CHUNK_SIZE,6291456));

function receipts(input=fixture()) { const p=buildPlan(input); return {version:1,target_ref:REHEARSAL_REF,snapshot_sha256:p.snapshot_sha256,files:p.files.map(f=>({legacy_id:f.legacy_id,target_bucket:f.target_bucket,target_path:f.target_path,size_bytes:f.size_bytes,source_sha256:sha256('abc'),target_sha256:sha256('abc'),verified_at:'2026-09-09T09:00:00Z'}))}; }
test('finalization refuses incomplete byte-copy verification',()=>{const r=receipts();r.files=[];assert.throws(()=>buildFinalizeSql(fixture(),r),/incomplete/);});
test('finalization refuses mismatched source and target byte hashes',()=>{const r=receipts();r.files[0].target_sha256=sha256('xyz');assert.throws(()=>buildFinalizeSql(fixture(),r),/checksums/);});
test('finalization refuses receipts from another snapshot',()=>{const r=receipts();r.snapshot_sha256='0'.repeat(64);assert.throws(()=>buildFinalizeSql(fixture(),r),/another snapshot/);});
test('finalization refuses target substitution',()=>{const r=receipts();r.target_ref=PRODUCTION_REF;assert.throws(()=>buildFinalizeSql(fixture(),r),/approved rehearsal/);});
test('finalization keeps media verification separate from Auth and consent images',()=>{const sql=buildFinalizeSql(fixture(),receipts());assert.match(sql,/INSERT INTO public.creator_files/);assert.match(sql,/'auth_migrated',false/);assert.match(sql,/'consent_image_transfer_verified',false/);assert.match(sql,/Existing creator file conflicts/);});

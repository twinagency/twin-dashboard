import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { dashboardPortraits } from '../components/dashboard/portraits';

async function main() {
  let admin = false, viewAs: unknown = null, downloads = 0, queries = 0, path = '', missing = false;
  const filters: Record<string, string> = {};
  const extracts: unknown[] = [];
  const file = 'app/api/dashboard/portrait/route.ts';
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const query = { select: () => query, eq: (key: string, value: string) => { filters[key] = value; return query; }, maybeSingle: async () => { queries++; return { data: missing ? null : { storage_path: path }, error: null }; } };
  const image = { rotate: () => image, resize: () => image, extract: (crop: unknown) => { extracts.push(crop); return image; }, webp: () => image, toBuffer: async () => Buffer.from('reviewed-crop') };
  const imports: Record<string, unknown> = {
    'next/headers': { cookies: async () => ({}) },
    sharp: { __esModule: true, default: () => image },
    '@/lib/internal-admin': { hasInternalAdminAccess: async () => admin },
    '@/lib/view-as': { activeViewAs: async () => viewAs },
    '@/lib/supabase': { supabaseAdmin: { from: () => query, storage: { from: () => ({ download: async () => { downloads++; return { data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null }; } }) } } },
    '@/components/dashboard/portraits': { dashboardPortraits },
  };
  const result = { exports: {} as { GET: (r: Request) => Promise<Response> } };
  new Function('require', 'module', 'exports', js)((name: string) => { assert.ok(name in imports, name); return imports[name]; }, result, result.exports);
  const get = (key = 'outdoor') => result.exports.GET(new Request(`https://dashboard.test/api/dashboard/portrait?image=${key}`));
  assert.equal((await get()).status, 403); assert.equal(queries, 0);
  admin = true; viewAs = { targetType: 'agency' };
  assert.equal((await get()).status, 403); assert.equal(queries, 0);
  viewAs = null;
  assert.equal((await get('unreviewed-file')).status, 404); assert.equal(queries, 0);
  path = 'another-creator/photos/private.jpg';
  assert.equal((await get()).status, 404); assert.equal(downloads, 0);
  path = '0328e7b3-a1e5-465a-9a30-c9cf6519cba1/photos/../unreviewed.jpg';
  assert.equal((await get()).status, 404); assert.equal(downloads, 0);
  path = '0328e7b3-a1e5-465a-9a30-c9cf6519cba1/photos/IMG_3536.jpg';
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(await response.text(), 'reviewed-crop');
  assert.equal(filters.clone_id, '0328e7b3-a1e5-465a-9a30-c9cf6519cba1');
  assert.equal(filters.id, dashboardPortraits[0].id);
  assert.deepEqual(extracts[0], dashboardPortraits[0].crop);
  assert.equal(downloads, 1); assert.equal((await get()).status, 200); assert.equal(downloads, 1);
  admin = false; assert.equal((await get()).status, 403); assert.equal(downloads, 1, 'A cached crop still requires authorization');
  admin = true; viewAs = { targetType: 'creator' }; assert.equal((await get()).status, 403);
  viewAs = null; missing = true; assert.equal((await get('studio')).status, 404);
  console.log('Dashboard portrait passed: internal admin only, view-as denied, fixed allowlist, creator ownership, path containment, reviewed crop, private response, cached authorization and missing-photo fallback.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

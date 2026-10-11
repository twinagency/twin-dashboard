import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { dashboardReader } from '@/lib/dashboard-reader';
import { requireCloneAccess } from '@/lib/dashboard-access';
import { supabaseAdmin } from '@/lib/supabase';
import { reviewedOverviewSlot } from '@/lib/flirt-overview-photos';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const cache = new Map<string, { expires: number; bytes: Uint8Array }>();
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
export const GET = dashboardReader(async (request: NextRequest) => {
  const id = request.nextUrl.searchParams.get('clone') || '';
  await requireCloneAccess(id);
  const slot = request.nextUrl.searchParams.get('slot') || '';
  const selected = reviewedOverviewSlot(id, slot);
  if (!selected) return new Response('Image not found', { status: 404, headers });
  // Check ownership and the current vault path even for a cached image.
  const { data: row, error } = await supabaseAdmin.from('photos').select('storage_path').eq('clone_id', id).eq('id', selected.id).maybeSingle();
  if (error || !row?.storage_path?.startsWith(`${id}/photos/`) || row.storage_path.split('/').includes('..')) return new Response('Image unavailable', { status: 404, headers });
  const key = `${id}:${slot}:${row.storage_path}`;
  try {
    let item = cache.get(key);
    if (!item || item.expires <= Date.now()) {
      const { data, error: downloadError } = await supabaseAdmin.storage.from('media').download(row.storage_path);
      if (downloadError || !data) throw new Error('Image unavailable');
      const bytes = await sharp(Buffer.from(await data.arrayBuffer())).rotate().extract(selected.crop).resize({ width: slot === 'avatar' ? 160 : slot === 'hero' ? 1200 : 700, withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
      item = { bytes: new Uint8Array(bytes), expires: Date.now() + 300_000 };
      if (cache.size >= 40) cache.delete(cache.keys().next().value!);
      cache.set(key, item);
    }
    return new Response(item.bytes as BodyInit, { headers: { ...headers, 'Content-Type': 'image/webp' } });
  } catch {
    return new Response('Image unavailable', { status: 503, headers });
  }
});

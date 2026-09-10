import { NextRequest, NextResponse } from 'next/server';
import { requireCreatorReportIdentity } from '@/lib/creator-reporting';
import { serviceClient } from '@/lib/supabase-service';
import { CreatorReportError } from '@/lib/creator-report-contract';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const identity = await requireCreatorReportIdentity();
    if (!identity.cloneId) return new NextResponse('Not found', { status: 404 });
    const path = req.nextUrl.searchParams.get('path');
    if (!path || path.length > 1000) return new NextResponse('Not found', { status: 404 });
    const db = serviceClient();
    const [photo, video] = await Promise.all([
      db.from('photos').select('id').eq('clone_id', identity.cloneId).eq('storage_path', path).maybeSingle(),
      db.from('videos').select('id').eq('clone_id', identity.cloneId).eq('storage_path', path).maybeSingle(),
    ]);
    let allowed = !!photo.data || !!video.data;
    if (!allowed) {
      const bundleItem = await db.from('photo_bundle_items').select('id,photo_bundles!inner(clone_id)').eq('storage_path', path).eq('photo_bundles.clone_id', identity.cloneId).limit(1).maybeSingle();
      allowed = !!bundleItem.data;
    }
    if (!allowed) return new NextResponse('Not found', { status: 404 });
    const { data, error } = await db.storage.from('media').createSignedUrl(path, 120);
    if (error || !data?.signedUrl) return new NextResponse('Preview unavailable', { status: 503 });
    return NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof CreatorReportError) return new NextResponse(error.status === 401 ? 'Sign in required' : 'Access denied', { status: error.status });
    return new NextResponse('Preview unavailable', { status: 503 });
  }
}

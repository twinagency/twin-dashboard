import { NextRequest, NextResponse } from 'next/server';
import { dashboardReader } from '@/lib/dashboard-reader';
import { getCreatorOverview, getOverviewAudience } from '@/lib/creator-overview';
import { getAgencyOverview } from '@/lib/agency-overview';
export const dynamic = 'force-dynamic';
export const GET = dashboardReader(async (req: NextRequest) => {
  const id = req.nextUrl.searchParams.get('clone');
  if (!id) return NextResponse.json(await getAgencyOverview(), { headers: { 'Cache-Control': 'private, no-store' } });
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Choose a creator' }, { status: 400 });
  const [presentation, audience] = await Promise.all([getCreatorOverview(id), getOverviewAudience(id)]);
  if (!presentation) return NextResponse.json({ error: 'Overview is not configured for this creator' }, { status: 404 });
  return NextResponse.json({ presentation, audience }, { headers: { 'Cache-Control': 'private, no-store' } });
});

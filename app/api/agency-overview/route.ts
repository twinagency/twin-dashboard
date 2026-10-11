import { NextResponse } from 'next/server';
import { dashboardReader } from '@/lib/dashboard-reader';
import { getAgencyOverview } from '@/lib/agency-overview';
export const dynamic = 'force-dynamic';
export const GET = dashboardReader(async () => NextResponse.json({ creators: await getAgencyOverview() }, { headers: { 'Cache-Control': 'private, no-store' } }));

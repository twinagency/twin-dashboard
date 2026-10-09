import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { hasInternalAdminAccess } from '@/lib/internal-admin';
import { activeViewAs } from '@/lib/view-as';
import { creators, authoredFans } from '@/components/fans/data';
import { parseFilters } from '@/components/dashboard/model';
import { loadBriannaLibraryMedia } from '@/lib/content-library-media';
import Campaigns from '@/components/campaigns/Campaigns';
export const dynamic = 'force-dynamic';
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!await hasInternalAdminAccess()) redirect('/twin');
  if (await activeViewAs(await cookies())) redirect('/revenue');
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === 'string') query.set(key, value);
  const filters = parseFilters(query, creators);
  if (filters.window === 'custom') filters.window = '30d';
  const mediaItems = await loadBriannaLibraryMedia();
  return <Campaigns creators={creators} fans={authoredFans} mediaItems={mediaItems} initialFilters={filters} initialId={query.get('campaign') || ''} initialView={query.get('view') || 'list'} initialSection={query.get('section') || 'Overview'} />;
}

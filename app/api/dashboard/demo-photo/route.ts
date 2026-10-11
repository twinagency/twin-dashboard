import { cookies } from 'next/headers';
import { hasInternalAdminAccess } from '@/lib/internal-admin';
import { activeViewAs } from '@/lib/view-as';
import { photoBase64 } from './photo-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Owner-supplied demo asset. Keep it server-side, behind the same access
// controls as the presentation, rather than publishing it under /public.
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
  if (!await hasInternalAdminAccess() || await activeViewAs(await cookies())) {
    return new Response('Not authorized', { status: 403, headers });
  }
  return new Response(new Uint8Array(Buffer.from(photoBase64, 'base64')), {
    headers: { ...headers, 'Content-Type': 'image/jpeg' },
  });
}

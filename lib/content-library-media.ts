import 'server-only';
import { supabaseAdmin } from './supabase';
import { defaultListings, type LibraryItem } from '../components/content-library/model';

// Explicit mapping from the presentation creator to her existing media owner.
// Called only after the Content Library's internal-admin and view-as guards.
const BRIANNA_CLONE = '0328e7b3-a1e5-465a-9a30-c9cf6519cba1';
export async function loadBriannaLibraryMedia(): Promise<LibraryItem[]> {
  const { data, error } = await supabaseAdmin.from('photos')
    .select('id,image_name,storage_path,star_value,created_at')
    .eq('clone_id', BRIANNA_CLONE).order('created_at', { ascending: false }).limit(18);
  if (error) throw new Error('Brianna’s media library could not be loaded.');
  const rows = (data || []).filter(row => typeof row.storage_path === 'string' && row.storage_path.startsWith(`${BRIANNA_CLONE}/`));
  if (!rows.length) return [];
  const signed = await supabaseAdmin.storage.from('media').createSignedUrls(rows.map(row => row.storage_path), 3600);
  if (signed.error) throw new Error('Brianna’s media previews could not be loaded.');
  return rows.flatMap(row => {
    const preview = signed.data?.find(entry => entry.path === row.storage_path && !entry.error)?.signedUrl;
    if (!preview) return [];
    const fileName = String(row.image_name || row.storage_path.split('/').at(-1));
    const title = fileName.split('__').at(-1)!.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
    const listings = defaultListings('Photo');
    listings.telegram = { enabled: true, price: Number(row.star_value) || 250 };
    return [{ id: `briana:source:photo:${row.id}`, creatorId: 'briana', title, originalTitle: title,
      kind: 'Photo' as const, description: `Original photo from Brianna’s content library. Source file: ${fileName}.`,
      collection: 'Original uploads', tags: ['photo', 'original upload'], status: 'Published' as const,
      addedAt: row.created_at, listings, members: [], preview, fileName, activity: [],
    }];
  });
}
